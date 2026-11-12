import type { AiTransport } from "../../core/ai/public.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { ImageHub } from "../../core/image-hub/public.ts";
import type { DataAppPublic, DataScope } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import {
  appendCampusBatch,
  createCampusId,
  emptyCampus,
  type CampusBatch,
  type CampusData,
  type CampusGenerationRequest,
  type CampusStorage,
} from "./campus-domain.ts";
import { applyCampusCommand, type CampusCommand } from "./campus-commands.ts";
import { campusSpace, readCampusAuthors, type CampusAuthor } from "./campus-context.ts";
import { generateCampusBatch } from "./campus-generation.ts";
import { createCampusAccounts } from "./campus-accounts.ts";

interface CampusDependencies {
  storage: CampusStorage;
  data: DataAppPublic;
  chat: ChatContext;
  imageHub: ImageHub;
  connections: ModelConnectionsReader;
  transport: AiTransport;
}

interface CampusScope {
  chatId: string;
  space: string;
  instance: string;
  query: DataScope;
}

type CampusGeneration = { phase: "generating"; scope: CampusScope; controller: AbortController };

type CampusTask =
  | CampusGeneration
  | { phase: "saving"; scope: CampusScope; batch: CampusBatch }
  | { phase: "unsaved"; scope: CampusScope; batch: CampusBatch; error: string };

/** 最近一次保存的定位信息只服务当前会话的界面，不进入持久数据。 */
export interface CampusSavedBatch {
  batchId: string;
  kind: "generated" | "published" | "commented";
  postIds: string[];
  commentIds: string[];
  targetPostId: string | null;
}

interface CampusSnapshot {
  data: CampusData;
  authors: CampusAuthor[];
  authorsReady: boolean;
  scopeKey: string | null;
  phase: "idle" | CampusTask["phase"];
  error: string | null;
  canRetry: boolean;
  completedBatchId: string | null;
  lastSaved: CampusSavedBatch | null;
  revealedBatchId: string | null;
}

export class CampusService {
  readonly imageHub: ImageHub;
  readonly #dependencies: CampusDependencies;
  readonly #listeners = new Set<() => void>();
  #open = false;
  #scope: CampusScope | null = null;
  #binding = "";
  #revision = 0;
  #scopeVerified = false;
  #writingEdit = false;
  #task: CampusTask | null = null;
  #snapshot: CampusSnapshot = {
    data: emptyCampus(),
    authors: [],
    authorsReady: false,
    scopeKey: null,
    phase: "idle",
    error: null,
    canRetry: false,
    completedBatchId: null,
    lastSaved: null,
    revealedBatchId: null,
  };

  constructor(dependencies: CampusDependencies) {
    this.#dependencies = dependencies;
    this.imageHub = dependencies.imageHub;
    dependencies.chat.subscribe(this.#refresh);
    dependencies.data.subscribe(this.#refresh);
  }

  getSnapshot = (): CampusSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  open(): void {
    this.#open = true;
    this.#refresh();
  }

  canQuit(): boolean {
    return this.#task?.phase !== "unsaved" && this.#task?.phase !== "saving";
  }

  quit(): void {
    this.#open = false;
    this.#binding = "";
    this.#scope = null;
    this.#revision++;
    this.#scopeVerified = false;
    this.#abortGeneration();
    this.#publish({
      data: emptyCampus(),
      authors: [],
      authorsReady: false,
      scopeKey: null,
      error: null,
      completedBatchId: null,
      lastSaved: null,
      revealedBatchId: null,
    });
  }

  #publish(fields: Partial<CampusSnapshot> = {}): void {
    const task = this.#task;
    const canRetry =
      task?.phase === "unsaved" &&
      this.#scopeVerified &&
      !this.#writingEdit &&
      task.scope.chatId === this.#scope?.chatId &&
      task.scope.space === this.#scope.space;
    const error =
      task?.phase === "unsaved"
        ? canRetry
          ? task.error
          : `${task.error}。返回原聊天和资料空间可重试保存，也可以舍弃。`
        : fields.error === undefined
          ? this.#snapshot.error
          : fields.error;
    this.#snapshot = {
      ...this.#snapshot,
      ...fields,
      phase: task?.phase ?? (this.#writingEdit ? "saving" : "idle"),
      canRetry,
      error,
    };
    for (const listener of this.#listeners) {
      listener();
    }
  }

  #refresh = (): void => {
    if (!this.#open) {
      return;
    }
    const { data, chat } = this.#dependencies;
    const chatId = chat.getSnapshot()?.id;
    const { context, revision, sourceId, characterRevision } = data.getSnapshot();
    const instance = JSON.stringify([
      chatId,
      context.chatIdentity,
      context.scopeId,
      context.available,
      context.sourceName,
    ]);
    const binding = JSON.stringify([instance, revision, sourceId, characterRevision]);
    if (binding === this.#binding) {
      return;
    }
    this.#binding = binding;
    this.#publish({ authorsReady: false });
    // Recheck the stable space on revision changes while keeping same-instance history visible.
    const refresh = ++this.#revision;
    this.#scopeVerified = false;
    if (this.#scope?.instance !== instance) {
      this.#scope = null;
      this.#abortGeneration();
      this.#publish({
        data: emptyCampus(),
        authors: [],
        scopeKey: null,
        error: null,
        completedBatchId: null,
        lastSaved: null,
        revealedBatchId: null,
      });
    }
    if (!chatId || !context.available || !context.chatIdentity || !context.scopeId) {
      this.#publish({
        error: context.message ?? "当前聊天没有可用的 Memory 资料空间",
        lastSaved: null,
        revealedBatchId: null,
      });
      return;
    }
    void this.#loadScope(
      chatId,
      instance,
      {
        chatIdentity: context.chatIdentity,
        scopeId: context.scopeId,
      },
      refresh,
    );
  };

  async #loadScope(
    chatId: string,
    instance: string,
    query: DataScope,
    revision: number,
  ): Promise<void> {
    const { data, storage } = this.#dependencies;
    try {
      const schema = await data.describe(query);
      if (revision !== this.#revision) {
        return;
      }
      const space = campusSpace(schema);
      const scope = { chatId, space, instance, query };
      if (this.#scope?.space !== space || this.#scope.instance !== instance) {
        this.#scope = null;
        this.#abortGeneration();
        this.#publish({
          data: emptyCampus(),
          authors: [],
          scopeKey: null,
          error: null,
          completedBatchId: null,
          lastSaved: null,
          revealedBatchId: null,
        });
        const saved = storage.read(chatId, space) ?? emptyCampus();
        this.#scope = scope;
        this.#scopeVerified = true;
        this.#publish({
          data: saved,
          authors: [],
          scopeKey: JSON.stringify([instance, space]),
          error: null,
        });
      } else {
        this.#scopeVerified = true;
        this.#publish();
      }
      const authors = await readCampusAuthors(data, query, () => revision === this.#revision);
      if (authors && revision === this.#revision) {
        this.#publish({ authors, authorsReady: true });
      }
    } catch (error) {
      if (revision === this.#revision) {
        this.#publish({ error: (error as Error).message });
      }
    }
  }

  #abortGeneration(): boolean {
    if (this.#task?.phase !== "generating") {
      return false;
    }
    this.#task.controller.abort();
    this.#task = null;
    return true;
  }

  stop(): void {
    if (this.#abortGeneration()) {
      this.#publish({ error: null });
    }
  }

  start(accountIds: string[], instruction: string, postId: string | null): string | null {
    const scope = this.#scope;
    if (!scope || this.#task || this.#writingEdit) {
      return null;
    }
    if (!this.#scopeVerified) {
      this.#publish({ error: "正在确认资料范围，请稍后重试" });
      return null;
    }
    const request = {
      id: createCampusId(),
      scope: scope.query,
      data: this.#snapshot.data,
      accountIds: [...accountIds],
      instruction,
      postId,
    };
    const task: CampusGeneration = {
      phase: "generating",
      scope,
      controller: new AbortController(),
    };
    this.#task = task;
    this.#publish({ error: null });
    void this.#generate(task, request);
    return request.id;
  }

  async #generate(task: CampusGeneration, request: CampusGenerationRequest): Promise<void> {
    const { scope, controller } = task;
    try {
      const batch = await generateCampusBatch(this.#dependencies, request, controller.signal);
      if (this.#task !== task) {
        return;
      }
      // A preset change may replace the stable space without changing its current instance ID.
      const schema = await this.#dependencies.data.describe(scope.query);
      if (this.#task !== task) {
        return;
      }
      if (scope.space !== campusSpace(schema)) {
        this.stop();
        return;
      }
      await this.#saveBatch(scope, batch);
    } catch (error) {
      if (this.#task !== task) {
        return;
      }
      this.#task = null;
      this.#publish({ error: (error as Error).message });
    }
  }

  async #saveBatch(scope: CampusScope, batch: CampusBatch): Promise<void> {
    const current = this.#snapshot.data;
    this.#task = { phase: "saving", scope, batch };
    this.#publish({ error: null });
    try {
      const data = appendCampusBatch(current, batch);
      await this.#dependencies.storage.write(scope.chatId, scope.space, data);
      this.#task = null;
      const saved: CampusSavedBatch = {
        batchId: batch.id,
        kind: "generated",
        postIds: batch.posts.map(({ id }) => id),
        commentIds: batch.interaction?.comments.map(({ id }) => id) ?? [],
        targetPostId: batch.interaction?.postId ?? null,
      };
      this.#publish(
        this.#savedScope(scope)
          ? { data, completedBatchId: batch.id, lastSaved: saved, revealedBatchId: null }
          : {},
      );
    } catch (error) {
      this.#task = { phase: "unsaved", scope, batch, error: (error as Error).message };
      this.#publish();
    }
  }

  retry(): void {
    const task = this.#task;
    if (
      task?.phase === "unsaved" &&
      this.#snapshot.canRetry &&
      this.#scopeVerified &&
      !this.#writingEdit
    ) {
      void this.#saveBatch(task.scope, task.batch);
    }
  }

  discard(): void {
    if (this.#task?.phase !== "unsaved") {
      return;
    }
    this.#task = null;
    this.#publish({ error: null });
  }

  dismissError(): void {
    if (!this.#task && this.#snapshot.error) {
      this.#publish({ error: null });
    }
  }

  clearSaved(): void {
    if (this.#snapshot.lastSaved) {
      this.#publish({ lastSaved: null, revealedBatchId: null });
    }
  }

  markSavedRevealed(batchId: string): void {
    if (
      this.#snapshot.lastSaved?.batchId === batchId &&
      this.#snapshot.revealedBatchId !== batchId
    ) {
      this.#publish({ revealedBatchId: batchId });
    }
  }

  async command(
    command: CampusCommand | { type: "create-accounts"; authorIds: string[]; scopeKey: string },
  ): Promise<boolean> {
    if (this.#task) {
      return false;
    }
    const saved = await this.#writeEdit((data) => {
      if (command.type !== "create-accounts") {
        return applyCampusCommand(data, command);
      }
      // 页面选择属于发起时的空间；人物刷新完成前不能用旧名单提交。
      if (command.scopeKey !== this.#snapshot.scopeKey || !this.#snapshot.authorsReady) {
        throw new Error("人物资料正在更新或范围已变化，请重新选择");
      }
      return createCampusAccounts(data, this.#snapshot.authors, command.authorIds);
    });
    if (!saved) {
      return false;
    }
    if (
      command.type === "publish" &&
      this.#snapshot.data.posts.some(({ id }) => id === command.post.id)
    ) {
      this.#publish({
        lastSaved: {
          batchId: `manual:${command.post.id}`,
          kind: "published",
          postIds: [command.post.id],
          commentIds: [],
          targetPostId: null,
        },
        revealedBatchId: null,
      });
    }
    if (
      command.type === "comment" &&
      this.#snapshot.data.posts
        .find(({ id }) => id === command.postId)
        ?.comments.some(({ id }) => id === command.comment.id)
    ) {
      this.#publish({
        lastSaved: {
          batchId: `manual:${command.comment.id}`,
          kind: "commented",
          postIds: [],
          commentIds: [command.comment.id],
          targetPostId: command.postId,
        },
        revealedBatchId: null,
      });
    }
    return true;
  }

  switchAccount(id: string): Promise<boolean> {
    if (this.#task?.phase === "saving") {
      return Promise.resolve(false);
    }
    this.stop();
    return this.#writeEdit((data) => {
      const account = data.accounts.find((entry) => entry.id === id);
      if (!account || account.disabled) {
        throw new Error("该账号已停用或不存在");
      }
      return { ...data, activeAccountId: id };
    });
  }

  async #writeEdit(update: (data: CampusData) => CampusData): Promise<boolean> {
    const scope = this.#scope;
    if (!scope || this.#writingEdit) {
      return false;
    }
    if (!this.#scopeVerified) {
      this.#publish({ error: "正在确认资料范围，请稍后重试" });
      return false;
    }
    const current = this.#snapshot.data;
    this.#writingEdit = true;
    this.#publish({ error: null });
    try {
      const data = update(current);
      if (data === current) {
        return true;
      }
      await this.#dependencies.storage.write(scope.chatId, scope.space, data);
      if (this.#savedScope(scope)) {
        this.#publish({ data });
      }
      return true;
    } catch (error) {
      if (this.#savedScope(scope)) {
        this.#publish({ error: (error as Error).message });
      }
      return false;
    } finally {
      this.#writingEdit = false;
      this.#publish();
    }
  }

  #savedScope(scope: CampusScope): boolean {
    return this.#scope?.chatId === scope.chatId && this.#scope.space === scope.space;
  }
}
