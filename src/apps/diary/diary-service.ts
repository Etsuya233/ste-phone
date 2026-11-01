import type { AiTransport } from "../../core/ai/public.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import {
  createEmptyDiary,
  createDiaryEntry,
  type DiaryData,
  type DiaryEntry,
  type DiarySettings,
  type DiarySnapshot,
} from "./diary.ts";
import type { DiaryStorage } from "./ports/diary-storage.ts";
import { generateDiaryText } from "./diary-generation.ts";
import {
  currentDiaryScope,
  readDiaryAuthors,
  readDiaryWorld,
  readDiaryContext,
} from "./diary-context.ts";
import { buildDiaryPrompt } from "./diary-prompt.ts";

interface DiaryDependencies {
  storage: DiaryStorage;
  data: DataAppPublic;
  chat: ChatContext;
  connections: ModelConnectionsReader;
  transport: AiTransport;
}

interface DiaryTask {
  readonly chatId: string;
  readonly controller: AbortController;
}

/** 持有当前聊天的日记和写作进度；取材、提示词和 Agent 运行各自独立。 */
export class DiaryService {
  readonly #dependencies: DiaryDependencies;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: (() => void)[];
  #snapshot: DiarySnapshot;
  #task: DiaryTask | null = null;
  // 会话身份用于隔离迟到的保存结果；刷新序号只用于资料刷新。
  #session = {};
  #preparationVersion = 0;
  #sourceScopeKey: string;
  #sourceId: string | null;

  constructor(dependencies: DiaryDependencies) {
    this.#dependencies = dependencies;
    const chatId = dependencies.chat.getSnapshot()?.id ?? null;
    this.#snapshot = {
      chatId,
      data: chatId ? (dependencies.storage.read(chatId) ?? createEmptyDiary()) : createEmptyDiary(),
      authors: [],
      worldTime: null,
      preparing: false,
      preparationError: null,
      generation: { status: "idle" },
      notice: null,
    };
    this.#sourceScopeKey = this.#currentSourceScopeKey();
    this.#sourceId = dependencies.data.getSnapshot().sourceId;
    this.#unsubscribe = [
      dependencies.chat.subscribe(this.#chatChanged),
      dependencies.data.subscribe(this.#sourceChanged),
    ];
  }

  getSnapshot = (): DiarySnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async prepare(): Promise<void> {
    if (this.#task) return;
    const version = ++this.#preparationVersion;
    this.#publish({ preparing: true, preparationError: null });
    try {
      if (!this.#snapshot.chatId) throw new Error("请先打开一个 ST 聊天");
      const { data } = this.#dependencies;
      const scope = currentDiaryScope(data);
      const authors = await readDiaryAuthors(data, scope);
      const world = await readDiaryWorld(data, scope);
      if (version === this.#preparationVersion)
        this.#publish({ authors, worldTime: world.worldTime, preparing: false });
    } catch (error) {
      if (version === this.#preparationVersion)
        this.#publish({ preparing: false, preparationError: error as Error });
    }
  }

  /** 从列表开始写下一篇；后台运行和待保存的正文继续保留。 */
  startWriting(): void {
    if (this.#snapshot.generation.status === "complete")
      this.#publish({ generation: { status: "idle" }, notice: null });
  }

  async selectAuthor(id: string): Promise<void> {
    if (this.#task) throw new Error("请先等待日记生成完成或取消，再修改作者");
    const author = this.#snapshot.authors.find((candidate) => candidate.id === id);
    if (!author) throw new Error("请选择当前资料中的日记作者");
    await this.#saveData({ ...this.#snapshot.data, author });
  }

  async saveSettings(settings: DiarySettings): Promise<void> {
    if (this.#task) throw new Error("请先等待日记生成完成或取消，再修改生成设置");
    if (
      !Number.isInteger(settings.timeoutSeconds) ||
      settings.timeoutSeconds <= 0 ||
      settings.timeoutSeconds * 1000 > 2_147_483_647
    )
      throw new Error("超时秒数须为正整数且不能超过 2147483 秒");
    if (!Number.isSafeInteger(settings.maxTokens) || settings.maxTokens <= 0)
      throw new Error("输出 token 上限须为正整数");
    await this.#saveData({ ...this.#snapshot.data, settings: { ...settings } });
  }

  async deleteEntry(id: string): Promise<void> {
    if (this.#task) throw new Error("请先等待日记生成完成或取消，再删除日记");
    await this.#saveData({
      ...this.#snapshot.data,
      entries: this.#snapshot.data.entries.filter((entry) => entry.id !== id),
    });
    const generation = this.#snapshot.generation;
    if (generation.status === "complete" && generation.entry.id === id)
      this.#publish({ generation: { status: "idle" } });
  }

  async generate(): Promise<void> {
    if (this.#task) throw new Error("日记正在生成，请等待完成或取消");
    const { chatId, data } = this.#snapshot;
    if (!chatId || !data.author) {
      const error = new Error(!chatId ? "请先打开一个 ST 聊天" : "请先选择日记作者");
      this.#publish({ generation: { status: "error", error } });
      return;
    }
    const task: DiaryTask = { chatId, controller: new AbortController() };
    this.#task = task;
    ++this.#preparationVersion;
    this.#publish({
      generation: { status: "reading" },
      preparing: false,
      preparationError: null,
      notice: null,
    });
    try {
      const { connections, transport } = this.#dependencies;
      const defaultId = connections.getSnapshot().defaultModelConnectionId;
      if (!defaultId) throw new Error("请先在设置中选择默认模型连接");
      const connection = connections.getConnection(defaultId);
      const settings = { ...data.settings };
      const context = await readDiaryContext(
        this.#dependencies.data,
        data.author,
        task.controller.signal,
      );
      if (!this.#ownsTask(task)) return;
      this.#publish({
        worldTime: context.world.worldTime,
        generation: { status: "generating", text: "" },
        notice: [
          context.chat.cleaning.enabled
            ? `清洗：${context.chat.cleaning.ruleName}`
            : "未启用聊天清洗",
          ...(context.skippedChronicles
            ? [`已跳过 ${context.skippedChronicles} 条剧情时间无效的纪要`]
            : []),
        ].join("；"),
      });
      const body = await generateDiaryText({
        transport,
        connection,
        settings,
        prompt: buildDiaryPrompt(context),
        signal: task.controller.signal,
        onText: (text) => {
          if (this.#ownsTask(task)) this.#publish({ generation: { status: "generating", text } });
        },
      });
      if (!this.#ownsTask(task)) return;
      // 普通资料更新保留已取材料；同实例重建成其他稳定空间时禁止保存旧作者结果。
      const schema = await this.#dependencies.data.describe(
        currentDiaryScope(this.#dependencies.data),
      );
      if (!this.#ownsTask(task)) return;
      if (
        schema.sourceId !== context.author.sourceId ||
        schema.stableScopeId !== context.author.scopeId
      )
        throw new Error("生成期间稳定资料空间已变化，未保存日记");
      const entry = createDiaryEntry(context.author, context.world.worldTime, body);
      await this.#saveEntry(entry, task);
    } catch (error) {
      if (this.#ownsTask(task))
        this.#publish({ generation: { status: "error", error: error as Error } });
    } finally {
      if (this.#task === task) this.#task = null;
    }
  }

  async retrySave(): Promise<void> {
    if (this.#task) throw new Error("日记正在保存，请等待完成");
    const { generation, chatId } = this.#snapshot;
    if (generation.status !== "save-error" || !chatId) throw new Error("没有待保存的日记");
    const task: DiaryTask = { chatId, controller: new AbortController() };
    this.#task = task;
    ++this.#preparationVersion;
    this.#publish({ preparing: false });
    try {
      await this.#saveEntry(generation.entry, task);
    } finally {
      if (this.#task === task) this.#task = null;
    }
  }

  cancel(): void {
    ++this.#preparationVersion;
    this.#session = {};
    this.#task?.controller.abort();
    this.#task = null;
    this.#publish({ generation: { status: "idle" }, preparing: false });
  }

  quit(): void {
    this.cancel();
  }

  dispose(): void {
    this.cancel();
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
    this.#listeners.clear();
  }

  #ownsTask(task: DiaryTask): boolean {
    // 即使切回同一聊天，已取消的旧任务也不能重新取得归属。
    return (
      this.#task === task &&
      !task.controller.signal.aborted &&
      this.#dependencies.chat.getSnapshot()?.id === task.chatId
    );
  }

  async #saveEntry(entry: DiaryEntry, task: DiaryTask): Promise<void> {
    this.#publish({ generation: { status: "saving", entry } });
    try {
      // 首次保存和重试共用同一条目；重试不重新生成正文，也不产生新 ID。
      await this.#saveData({
        ...this.#snapshot.data,
        entries: [entry, ...this.#snapshot.data.entries.filter((item) => item.id !== entry.id)],
      });
      if (this.#ownsTask(task)) this.#publish({ generation: { status: "complete", entry } });
    } catch (error) {
      if (this.#ownsTask(task))
        this.#publish({ generation: { status: "save-error", entry, error: error as Error } });
    }
  }

  async #saveData(data: DiaryData): Promise<void> {
    const { chatId } = this.#snapshot;
    const session = this.#session;
    if (!chatId || this.#dependencies.chat.getSnapshot()?.id !== chatId)
      throw new Error("当前聊天已变化，未保存日记");
    await this.#dependencies.storage.write(chatId, data);
    if (session === this.#session && this.#snapshot.chatId === chatId) this.#publish({ data });
  }

  #currentSourceScopeKey(): string {
    const source = this.#dependencies.data.getSnapshot().context;
    return JSON.stringify([source.sourceName, source.chatIdentity, source.scopeId]);
  }
  #chatChanged = (): void => {
    const chatId = this.#dependencies.chat.getSnapshot()?.id ?? null;
    if (chatId === this.#snapshot.chatId) return;
    this.cancel();
    this.#publish({
      chatId,
      data: chatId
        ? (this.#dependencies.storage.read(chatId) ?? createEmptyDiary())
        : createEmptyDiary(),
      authors: [],
      worldTime: null,
      notice: null,
      preparationError: null,
    });
  };
  #sourceChanged = (): void => {
    const binding = this.#currentSourceScopeKey();
    const sourceId = this.#dependencies.data.getSnapshot().sourceId;
    if (
      binding !== this.#sourceScopeKey ||
      (this.#sourceId !== null && sourceId !== null && sourceId !== this.#sourceId)
    ) {
      this.cancel();
      this.#publish({ authors: [], worldTime: null, notice: null, preparationError: null });
    }
    this.#sourceScopeKey = binding;
    this.#sourceId = sourceId;
  };
  #publish(patch: Partial<DiarySnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of this.#listeners) listener();
  }
}
