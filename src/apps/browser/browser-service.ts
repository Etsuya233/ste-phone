import type { AiTransport } from "../../core/ai/public.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import { readBrowserAuthors, sameWebsiteAuthor } from "./browser-authors.ts";
import { generateWebsite, type BrowserStep } from "./browser-generation.ts";
import { emptyBrowserData, newWebsite } from "./browser.ts";
import type {
  BrowserData,
  BrowserStorage,
  WebsiteAuthor,
  WebsiteVersion,
  WebsiteWork,
} from "./browser.ts";

export interface BrowserActivity {
  readonly runId: number;
  readonly turnIndex: number;
  readonly instruction: string;
  readonly steps: readonly BrowserStep[];
  readonly status: "running" | "done" | "failed" | "stopped";
}

interface Workspace {
  readonly activities: ReadonlyMap<string, BrowserActivity>;
  readonly saved: BrowserData;
  readonly readError: string | null;
  readonly drafts: ReadonlyMap<string, WebsiteWork>;
  readonly instructions: ReadonlyMap<string, string>;
  readonly saving: string | null;
  readonly error: string | null;
}

interface Generation {
  readonly chatId: string;
  readonly workId: string;
  readonly controller: AbortController;
}

export interface BrowserSnapshot extends Workspace {
  readonly chatId: string | null;
  readonly generation: Generation | null;
  readonly authorRevision: number;
}

const emptyWorkspace: Workspace = {
  saved: emptyBrowserData,
  readError: null,
  drafts: new Map(),
  instructions: new Map(),
  activities: new Map(),
  saving: null,
  error: null,
};

interface BrowserDependencies {
  readonly chat: ChatContext;
  readonly storage: BrowserStorage;
  readonly data: DataAppPublic;
  readonly connections: ModelConnectionsReader;
  readonly transport: AiTransport;
}

export class BrowserService {
  readonly #workspaces = new Map<string, Workspace>();
  readonly #listeners = new Set<() => void>();
  #snapshot: BrowserSnapshot = {
    ...emptyWorkspace,
    chatId: null,
    generation: null,
    authorRevision: 0,
  };
  #generation: Generation | null = null;
  #nextRunId = 0;
  #sourceInstance: string | null = null;
  #authorRevision = 0;
  #characterRevision: number | undefined;

  readonly #dependencies: BrowserDependencies;

  constructor(dependencies: BrowserDependencies) {
    this.#dependencies = dependencies;
    dependencies.chat.subscribe(this.#chatChanged);
    dependencies.data.subscribe(this.#sourceChanged);
    this.#sourceChanged();
    this.#chatChanged();
  }

  getSnapshot = (): BrowserSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readAuthors = () => readBrowserAuthors(this.#dependencies.data);

  create(author: WebsiteAuthor, authorRevision: number): string {
    const chatId = this.#activeChat();
    if (this.#snapshot.saving) {
      throw new Error("请等待当前保存完成");
    }
    if (authorRevision !== this.#authorRevision) {
      throw new Error("人物资料已更新，请重新选择作者");
    }
    const work = newWebsite(author);
    this.#editDraft(chatId, work);
    return work.id;
  }

  edit(workId: string, changes: Partial<Pick<WebsiteWork, "title" | "source">>): void {
    const chatId = this.#activeChat();
    this.#editDraft(chatId, { ...this.#editableWork(workId), ...changes });
  }

  discard(workId: string): void {
    const chatId = this.#activeChat();
    this.#editableWork(workId);
    const drafts = new Map(this.#snapshot.drafts);
    const instructions = new Map(this.#snapshot.instructions);
    const activities = new Map(this.#snapshot.activities);
    drafts.delete(workId);
    instructions.delete(workId);
    activities.delete(workId);
    this.#update(chatId, { drafts, instructions, activities, error: null });
  }

  restore(workId: string, version: WebsiteVersion): void {
    this.edit(workId, { title: version.title, source: version.source });
  }

  setInstruction(workId: string, instruction: string): void {
    const chatId = this.#activeChat();
    const instructions = new Map(this.#snapshot.instructions);
    if (instruction) {
      instructions.set(workId, instruction);
    } else {
      instructions.delete(workId);
    }
    this.#update(chatId, { instructions });
  }

  async generate(workId: string, connectionId: string): Promise<boolean> {
    const chatId = this.#activeChat();
    const work = this.#editableWork(workId);
    if (this.#generation) {
      throw new Error("请先停止正在进行的网页创作");
    }
    const instruction = this.#snapshot.instructions.get(workId)?.trim();
    if (!instruction) {
      throw new Error("请输入创作指令");
    }
    const connection = this.#dependencies.connections.getConnection(connectionId);
    const task = { chatId, workId, controller: new AbortController() };
    this.#generation = task;
    const activities = new Map(this.#snapshot.activities);
    activities.set(workId, {
      runId: ++this.#nextRunId,
      turnIndex: work.turns.length,
      instruction,
      steps: [],
      status: "running",
    });
    this.#update(chatId, { activities, error: null });
    try {
      const authors = await this.readAuthors();
      if (this.#generation !== task) {
        return false;
      }
      const author = authors.find((candidate) => sameWebsiteAuthor(candidate, work.author));
      if (!author) {
        throw new Error("当前资料中没有这位作者");
      }
      const result = await generateWebsite({
        transport: this.#dependencies.transport,
        connection,
        work,
        author,
        instruction,
        signal: task.controller.signal,
        onStep: (step) => {
          if (this.#generation === task) {
            const { steps } = this.#snapshot.activities.get(workId)!;
            this.#activity(task, {
              steps: steps.some(({ id }) => id === step.id)
                ? steps.map((item) => (item.id === step.id ? step : item))
                : [...steps, step],
            });
          }
        },
      });
      if (this.#generation !== task) {
        return false;
      }
      this.#editDraft(chatId, { ...work, ...result });
      this.setInstruction(workId, "");
      this.#activity(task, { status: "done" });
      return true;
    } catch (cause) {
      if (this.#generation === task) {
        this.#activity(task, { status: "failed" }, (cause as Error).message);
      }
      return false;
    } finally {
      if (this.#generation === task) {
        this.#generation = null;
        this.#publish(chatId);
      }
    }
  }

  stop = (): void => {
    const task = this.#generation;
    if (!task) {
      return;
    }
    // 先解除任务归属，忽略停止后仍返回的模型输出。
    this.#generation = null;
    task.controller.abort();
    this.#activity(task, { status: "stopped" });
  };

  #activity(
    task: Generation,
    changes: Partial<Omit<BrowserActivity, "runId">>,
    error = this.#snapshot.error,
  ): void {
    const activities = new Map(this.#snapshot.activities);
    const current = activities.get(task.workId)!;
    activities.set(task.workId, { ...current, ...changes });
    this.#update(task.chatId, { activities, error });
  }

  async save(workId: string): Promise<void> {
    const chatId = this.#activeChat();
    const work = this.#editableWork(workId);
    if (!this.#snapshot.drafts.has(workId)) {
      return;
    }
    const { saved } = this.#snapshot;
    const title = work.title.trim();
    if (!title) {
      throw new Error("请填写作品标题");
    }
    const version = { title, source: work.source, savedAt: new Date().toISOString() };
    const confirmed = { ...work, title, versions: [...work.versions, version] };
    const previous = saved.works.some((item) => item.id === workId);
    const next = {
      ...saved,
      works: previous
        ? saved.works.map((item) => (item.id === workId ? confirmed : item))
        : [confirmed, ...saved.works],
    };
    this.#update(chatId, { saving: workId, error: null });
    try {
      await this.#dependencies.storage.write(chatId, next);
      // 保存已经绑定原聊天；切换聊天后仍只更新原聊天的作品。
      const drafts = new Map(this.#workspaces.get(chatId)!.drafts);
      drafts.delete(workId);
      this.#update(chatId, { saved: next, drafts });
    } catch (cause) {
      this.#update(chatId, { error: (cause as Error).message });
    } finally {
      this.#update(chatId, { saving: null });
    }
  }

  #activeChat(): string {
    const { chatId } = this.#snapshot;
    if (!chatId) {
      throw new Error("请先打开一个 ST 聊天");
    }
    if (this.#snapshot.readError) {
      throw new Error(this.#snapshot.readError);
    }
    return chatId;
  }

  #editableWork(id: string): WebsiteWork {
    const { drafts, saved, saving } = this.#snapshot;
    if (saving || this.#generation?.workId === id) {
      throw new Error("请等待当前操作完成");
    }
    const work = drafts.get(id) ?? saved.works.find((item) => item.id === id);
    if (!work) {
      throw new Error("作品不存在");
    }
    return work;
  }

  #editDraft(chatId: string, work: WebsiteWork): void {
    const drafts = new Map(this.#workspaces.get(chatId)!.drafts);
    drafts.set(work.id, work);
    this.#update(chatId, { drafts, error: null });
  }

  #sourceChanged = (): void => {
    const { context, characterRevision } = this.#dependencies.data.getSnapshot();
    const { available, sourceName, chatIdentity, scopeId } = context;
    const instance = JSON.stringify([available, sourceName, chatIdentity, scopeId]);
    const instanceChanged = instance !== this.#sourceInstance;
    if (instanceChanged || characterRevision !== this.#characterRevision) {
      this.#sourceInstance = instance;
      this.#characterRevision = characterRevision;
      this.#authorRevision++;
      if (instanceChanged && this.#generation) {
        this.stop();
      } else {
        this.#publish(this.#snapshot.chatId);
      }
    }
  };

  #chatChanged = (): void => {
    const chatId = this.#dependencies.chat.getSnapshot()?.id ?? null;
    if (chatId === this.#snapshot.chatId) {
      return;
    }
    this.stop();
    if (chatId && !this.#workspaces.has(chatId)) {
      try {
        const saved = this.#dependencies.storage.read(chatId) ?? emptyBrowserData;
        this.#workspaces.set(chatId, { ...emptyWorkspace, saved });
      } catch (cause) {
        this.#workspaces.set(chatId, { ...emptyWorkspace, readError: (cause as Error).message });
      }
    }
    this.#publish(chatId);
  };

  #update(chatId: string, changes: Partial<Workspace>): void {
    this.#workspaces.set(chatId, { ...this.#workspaces.get(chatId)!, ...changes });
    if (this.#snapshot.chatId === chatId) {
      this.#publish(chatId);
    }
  }

  #publish(chatId: string | null): void {
    this.#snapshot = {
      ...(chatId ? this.#workspaces.get(chatId)! : emptyWorkspace),
      chatId,
      generation: this.#generation,
      authorRevision: this.#authorRevision,
    };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
