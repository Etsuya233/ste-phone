import { DiaryImages, type DiaryImageAction } from "./diary-images.ts";
import type { ImageHub, ImageRecord } from "../../core/image-hub/public.ts";
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
import { generateDiaryText, parseDiaryReply } from "./diary-generation.ts";
import {
  currentDiaryScope,
  type DiaryContext,
  readDiaryAuthors,
  readDiaryWorld,
  readDiaryContext,
} from "./diary-context.ts";
import { buildDiaryPrompt } from "./diary-prompt.ts";

interface DiaryDependencies {
  storage: DiaryStorage;
  imageHub: ImageHub;
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
  readonly #images: DiaryImages;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: (() => void)[];
  #snapshot: DiarySnapshot;
  #task: DiaryTask | null = null;
  #writing = false;
  // 会话身份用于隔离迟到的保存结果；刷新序号只用于资料刷新。
  #session = {};
  #preparationVersion = 0;
  #sourceScopeKey: string;
  #sourceId: string | null;

  constructor(dependencies: DiaryDependencies) {
    this.#dependencies = dependencies;
    this.#images = new DiaryImages(dependencies);
    const chatId = dependencies.chat.getSnapshot()?.id ?? null;
    this.#snapshot = {
      chatId,
      data: chatId ? (dependencies.storage.read(chatId) ?? createEmptyDiary()) : createEmptyDiary(),
      authors: [],
      worldTime: null,
      preparing: false,
      preparationError: null,
      generation: { status: "idle" },
      imageTask: { status: "idle" },
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
    if (this.#task || this.#writing) {
      return;
    }
    const version = ++this.#preparationVersion;
    this.#publish({ preparing: true, preparationError: null });
    try {
      if (!this.#snapshot.chatId) {
        throw new Error("请先打开一个 ST 聊天");
      }
      const { data } = this.#dependencies;
      const scope = currentDiaryScope(data);
      const characterRevision = this.#characterRevision;
      const authors = await readDiaryAuthors(data, scope);
      const world = await readDiaryWorld(data, scope);
      if (version === this.#preparationVersion) {
        this.#publish({
          ...(characterRevision === this.#characterRevision ? { authors } : {}),
          worldTime: world.worldTime,
          preparing: false,
        });
      }
    } catch (error) {
      if (version === this.#preparationVersion) {
        this.#publish({ preparing: false, preparationError: error as Error });
      }
    }
  }

  /** 从列表开始写下一篇；后台运行和待保存的正文继续保留。 */
  startWriting(): void {
    if (this.#snapshot.generation.status === "complete") {
      this.#publish({ generation: { status: "idle" } });
    }
  }

  async selectAuthor(id: string): Promise<void> {
    if (this.#task || this.#writing) {
      throw new Error("请先等待日记生成完成或取消，再修改作者");
    }
    const author = this.#snapshot.authors.find((candidate) => candidate.id === id);
    if (!author) {
      throw new Error("请选择当前资料中的日记作者");
    }
    const { id: authorId, name, profileText, scopeId, sourceId } = author;
    await this.#saveData({
      ...this.#snapshot.data,
      author: { id: authorId, name, profileText, scopeId, sourceId },
    });
  }

  async saveSettings(settings: DiarySettings): Promise<void> {
    if (this.#task || this.#writing) {
      throw new Error("请先等待日记生成完成或取消，再修改生成设置");
    }
    if (
      !Number.isInteger(settings.timeoutSeconds) ||
      settings.timeoutSeconds <= 0 ||
      settings.timeoutSeconds * 1000 > 2_147_483_647
    ) {
      throw new Error("超时秒数须为正整数且不能超过 2147483 秒");
    }
    if (!Number.isSafeInteger(settings.maxTokens) || settings.maxTokens <= 0) {
      throw new Error("输出 token 上限须为正整数");
    }
    if (
      settings.autoGenerateImage !== undefined &&
      typeof settings.autoGenerateImage !== "boolean"
    ) {
      throw new Error("自动配图设置须为布尔值");
    }
    await this.#saveData({ ...this.#snapshot.data, settings: { ...settings } });
  }

  async deleteEntry(id: string): Promise<void> {
    if (this.#task || this.#writing) {
      throw new Error("请先等待日记生成完成或取消，再删除日记");
    }
    await this.#saveData({
      ...this.#snapshot.data,
      entries: this.#snapshot.data.entries.filter((entry) => entry.id !== id),
    });
    const generation = this.#snapshot.generation;
    if (generation.status === "complete" && generation.entry.id === id) {
      this.#publish({ generation: { status: "idle" } });
    }
  }

  async generate(): Promise<void> {
    if (this.#task || this.#writing) {
      throw new Error("日记正在生成，请等待完成或取消");
    }
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
    });
    try {
      const { connections, transport } = this.#dependencies;
      const defaultId = connections.getSnapshot().defaultModelConnectionId;
      if (!defaultId) {
        throw new Error("请先在设置中选择默认模型连接");
      }
      const connection = connections.getConnection(defaultId);
      const settings = { ...data.settings };
      const context = await readDiaryContext(
        this.#dependencies.data,
        data.author,
        task.controller.signal,
      );
      if (!this.#ownsTask(task)) {
        return;
      }
      this.#publish({
        worldTime: context.world.worldTime,
        generation: { status: "generating", thinking: false },
      });
      const text = await generateDiaryText({
        transport,
        connection,
        settings,
        prompt: buildDiaryPrompt(context),
        signal: task.controller.signal,
        ...this.#generationProgress(task),
      });
      if (!this.#ownsTask(task)) {
        return;
      }
      const result = parseDiaryReply(text);
      await this.#saveGeneratedDiary(context, result, task);
    } catch (error) {
      if (this.#ownsTask(task)) {
        this.#publish({ generation: { status: "error", error: error as Error } });
      }
    } finally {
      if (this.#task === task) {
        this.#task = null;
      }
    }
  }

  async retrySave(): Promise<void> {
    if (this.#task || this.#writing) {
      throw new Error("日记正在保存，请等待完成");
    }
    const { generation, chatId } = this.#snapshot;
    if (generation.status !== "save-error" || !chatId) {
      throw new Error("没有待保存的日记");
    }
    const task: DiaryTask = { chatId, controller: new AbortController() };
    this.#task = task;
    ++this.#preparationVersion;
    this.#publish({ preparing: false });
    try {
      await this.#saveEntry(generation.entry, task);
    } finally {
      if (this.#task === task) {
        this.#task = null;
      }
    }
  }

  async saveImagePrompt(entryId: string, prompt: string): Promise<void> {
    await this.#runImageTask(entryId, { type: "prompt", prompt });
  }

  async selectImage(entryId: string, image: ImageRecord): Promise<void> {
    await this.#runImageTask(entryId, { type: "select", image });
  }

  async generateImage(entryId: string): Promise<void> {
    await this.#runImageTask(entryId, { type: "generate" });
  }

  async createImagePrompt(entryId: string): Promise<void> {
    await this.#runImageTask(entryId, { type: "create-prompt" });
  }

  async removeImage(entryId: string): Promise<void> {
    await this.#runImageTask(entryId, { type: "remove" });
  }

  async #runImageTask(entryId: string, action: DiaryImageAction): Promise<void> {
    if (this.#task || this.#writing) {
      throw new Error("请等待当前日记任务完成");
    }
    const entry = this.#snapshot.data.entries.find((item) => item.id === entryId);
    if (!entry) {
      throw new Error("日记已不存在");
    }
    const chatId = this.#snapshot.chatId;
    if (!chatId) {
      throw new Error("请先打开一个 ST 聊天");
    }
    const task: DiaryTask = { chatId, controller: new AbortController() };
    this.#task = task;
    try {
      await this.#images.applyImageAction(
        entry,
        action,
        this.#snapshot.data.settings,
        task.controller.signal,
        {
          ownsTask: () => this.#ownsTask(task),
          phase: (status) => this.#publish({ imageTask: { status, entryId } }),
          save: (updated) => this.#saveImageEntry(updated, task),
        },
      );
      if (this.#ownsTask(task)) {
        this.#publish({ imageTask: { status: "idle" } });
      }
    } catch (error) {
      if (this.#ownsTask(task)) {
        this.#publish({ imageTask: { status: "error", entryId, error: error as Error } });
        throw error;
      }
    } finally {
      if (this.#task === task) {
        this.#task = null;
      }
    }
  }

  async #saveImageEntry(entry: DiaryEntry, task: DiaryTask): Promise<void> {
    if (!this.#ownsTask(task)) {
      return;
    }
    this.#publish({ imageTask: { status: "saving", entryId: entry.id } });
    await this.#saveData({
      ...this.#snapshot.data,
      entries: this.#snapshot.data.entries.map((item) => (item.id === entry.id ? entry : item)),
    });
    if (
      this.#ownsTask(task) &&
      this.#snapshot.generation.status === "complete" &&
      this.#snapshot.generation.entry.id === entry.id
    ) {
      this.#publish({ generation: { status: "complete", entry } });
    }
  }

  cancel(): void {
    ++this.#preparationVersion;
    this.#session = {};
    this.#task?.controller.abort();
    this.#task = null;
    this.#publish({
      generation: { status: "idle" },
      imageTask: { status: "idle" },
      preparing: false,
    });
  }

  quit(): void {
    this.cancel();
  }

  dispose(): void {
    this.cancel();
    for (const unsubscribe of this.#unsubscribe) {
      unsubscribe();
    }
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

  #generationProgress(task: DiaryTask): {
    onThinking(): void;
  } {
    return {
      // 回复包含 JSON 协议，完整校验前只展示思考状态。
      onThinking: () => {
        const generation = this.#snapshot.generation;
        if (this.#ownsTask(task) && generation.status === "generating" && !generation.thinking) {
          this.#publish({ generation: { ...generation, thinking: true } });
        }
      },
    };
  }

  async #saveGeneratedDiary(
    context: DiaryContext,
    result: { body: string; imagePrompt: string },
    task: DiaryTask,
  ): Promise<void> {
    // 普通资料更新保留已取材料；同实例重建成其他稳定空间时禁止保存旧作者结果。
    const schema = await this.#dependencies.data.describe(
      currentDiaryScope(this.#dependencies.data),
    );
    if (!this.#ownsTask(task)) {
      return;
    }
    if (
      schema.sourceId !== context.author.sourceId ||
      schema.stableScopeId !== context.author.scopeId
    ) {
      throw new Error("生成期间稳定资料空间已变化，未保存日记");
    }
    const entry = {
      ...createDiaryEntry(context.author, context.world.worldTime, result.body),
      imagePrompt: result.imagePrompt,
    };
    await this.#saveEntry(entry, task);
  }

  async #saveEntry(entry: DiaryEntry, task: DiaryTask): Promise<void> {
    this.#publish({ generation: { status: "saving", entry } });
    try {
      // 首次保存和重试共用同一条目；重试不重新生成正文，也不产生新 ID。
      await this.#saveData({
        ...this.#snapshot.data,
        entries: [entry, ...this.#snapshot.data.entries.filter((item) => item.id !== entry.id)],
      });
    } catch (error) {
      if (this.#ownsTask(task)) {
        this.#publish({ generation: { status: "save-error", entry, error: error as Error } });
      }
      return;
    }
    if (!this.#ownsTask(task)) {
      return;
    }
    this.#publish({ generation: { status: "complete", entry } });
    if (this.#snapshot.data.settings.autoGenerateImage) {
      await this.#generateAutomaticImage(entry, task);
    }
  }

  async #generateAutomaticImage(entry: DiaryEntry, task: DiaryTask): Promise<void> {
    try {
      await this.#images.applyImageAction(
        entry,
        { type: "generate" },
        this.#snapshot.data.settings,
        task.controller.signal,
        {
          ownsTask: () => this.#ownsTask(task),
          phase: (status) => this.#publish({ imageTask: { status, entryId: entry.id } }),
          save: (updated) => this.#saveImageEntry(updated, task),
        },
      );
      if (this.#ownsTask(task)) {
        this.#publish({ imageTask: { status: "idle" } });
      }
    } catch (error) {
      // 正文已保存，自动配图错误只影响图片任务，不能降为正文保存失败。
      if (this.#ownsTask(task)) {
        this.#publish({ imageTask: { status: "error", entryId: entry.id, error: error as Error } });
      }
    }
  }

  async #saveData(data: DiaryData): Promise<void> {
    const { chatId } = this.#snapshot;
    const session = this.#session;
    if (!chatId || this.#dependencies.chat.getSnapshot()?.id !== chatId) {
      throw new Error("当前聊天已变化，未保存日记");
    }
    if (this.#writing) {
      throw new Error("请等待当前日记保存完成");
    }
    this.#writing = true;
    try {
      await this.#dependencies.storage.write(chatId, data);
    } finally {
      this.#writing = false;
    }
    if (session === this.#session && this.#snapshot.chatId === chatId) {
      this.#publish({ data });
    }
  }

  #currentSourceScopeKey(): string {
    const source = this.#dependencies.data.getSnapshot().context;
    return JSON.stringify([source.sourceName, source.chatIdentity, source.scopeId]);
  }
  #chatChanged = (): void => {
    const chatId = this.#dependencies.chat.getSnapshot()?.id ?? null;
    if (chatId === this.#snapshot.chatId) {
      return;
    }
    this.cancel();
    this.#publish({
      chatId,
      data: chatId
        ? (this.#dependencies.storage.read(chatId) ?? createEmptyDiary())
        : createEmptyDiary(),
      authors: [],
      worldTime: null,
      preparationError: null,
    });
  };
  #characterRevision = 0;
  #sourceChanged = (): void => {
    const binding = this.#currentSourceScopeKey();
    const { sourceId, characterRevision = 0 } = this.#dependencies.data.getSnapshot();
    if (
      binding !== this.#sourceScopeKey ||
      (this.#sourceId !== null && sourceId !== null && sourceId !== this.#sourceId)
    ) {
      this.cancel();
      this.#publish({ authors: [], worldTime: null, preparationError: null });
    }
    this.#sourceScopeKey = binding;
    this.#sourceId = sourceId;
    if (this.#characterRevision !== characterRevision) {
      this.#characterRevision = characterRevision;
      void this.#refreshCharacterRoster(binding, characterRevision);
    }
  };
  async #refreshCharacterRoster(binding: string, revision: number): Promise<void> {
    const { chatId } = this.#snapshot;
    const { data } = this.#dependencies;
    const isCurrent = () =>
      this.#snapshot.chatId === chatId &&
      this.#sourceScopeKey === binding &&
      this.#characterRevision === revision;
    try {
      // 书目作者可以更新；运行中的日记继续使用已取得的生成输入。
      const authors = await readDiaryAuthors(data, currentDiaryScope(data));
      if (isCurrent()) {
        this.#publish({ authors });
      }
    } catch (error) {
      if (isCurrent()) {
        this.#publish({ preparationError: error as Error });
      }
    }
  }
  #publish(patch: Partial<DiarySnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
