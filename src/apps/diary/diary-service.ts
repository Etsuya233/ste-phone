import type { AiTransport } from "../../core/ai/public.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { DataAppPublic, DataScope } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import {
  createEmptyDiary,
  type DiaryAuthor,
  type DiaryData,
  type DiaryEntry,
  type DiarySettings,
  type DiarySnapshot,
} from "./diary.ts";
import type { DiaryStorage } from "./ports/diary-storage.ts";
import { generateDiaryText } from "./diary-generation.ts";

interface DiaryDependencies {
  storage: DiaryStorage;
  data: DataAppPublic;
  chat: ChatContext;
  connections: ModelConnectionsReader;
  transport: AiTransport;
}

export class DiaryService {
  readonly #dependencies: DiaryDependencies;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: (() => void)[];
  #snapshot: DiarySnapshot;
  #controller: AbortController | null = null;
  #epoch = 0;
  #sourceBinding: string;
  #sourceId: string | null;

  constructor(dependencies: DiaryDependencies) {
    this.#dependencies = dependencies;
    const chatId = dependencies.chat.getSnapshot()?.id ?? null;
    this.#snapshot = {
      chatId,
      data: chatId ? (dependencies.storage.read(chatId) ?? createEmptyDiary()) : createEmptyDiary(),
      authors: [],
      worldTime: null,
      status: "idle",
      text: "",
      error: null,
      notice: null,
      result: null,
      unsaved: null,
    };
    this.#sourceBinding = this.#binding();
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
    if (this.#controller) return;
    const epoch = ++this.#epoch;
    this.#publish({ status: "loading", error: null });
    try {
      const context = await this.#readContext();
      if (epoch !== this.#epoch) return;
      this.#publish({ authors: context.authors, worldTime: context.worldTime, status: "idle" });
    } catch (error) {
      if (epoch === this.#epoch)
        this.#publish({ status: "error", error: (error as Error).message });
    }
  }

  async selectAuthor(id: string): Promise<void> {
    if (this.#controller) throw new Error("请先等待日记生成完成或取消，再修改作者");
    const author = this.#snapshot.authors.find((candidate) => candidate.id === id);
    if (!author) throw new Error("请选择当前资料中的日记作者");
    await this.#saveData({ ...this.#snapshot.data, author });
  }

  async saveSettings(settings: DiarySettings): Promise<void> {
    if (this.#controller) throw new Error("请先等待日记生成完成或取消，再修改生成设置");
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
    if (this.#controller) throw new Error("请先等待日记生成完成或取消，再删除日记");
    await this.#saveData({
      ...this.#snapshot.data,
      entries: this.#snapshot.data.entries.filter((entry) => entry.id !== id),
    });
    if (this.#snapshot.result?.id === id) this.#publish({ result: null });
  }

  async generate(): Promise<void> {
    if (this.#controller) throw new Error("日记正在生成，请等待完成或取消");
    const chatId = this.#snapshot.chatId;
    if (!chatId) {
      this.#publish({ status: "error", error: "请先打开一个 ST 聊天" });
      return;
    }
    const selected = this.#snapshot.data.author;
    if (!selected) {
      this.#publish({ status: "error", error: "请先选择日记作者" });
      return;
    }
    const controller = new AbortController();
    this.#controller = controller;
    const epoch = ++this.#epoch;
    const settings = { ...this.#snapshot.data.settings };
    this.#publish({
      status: "loading",
      text: "",
      error: null,
      notice: null,
      result: null,
      unsaved: null,
    });
    try {
      const defaultId = this.#dependencies.connections.getSnapshot().defaultModelConnectionId;
      if (!defaultId) throw new Error("请先在设置中选择默认模型连接");
      const connection = this.#dependencies.connections.getConnection(defaultId);
      const context = await this.#readContext();
      controller.signal.throwIfAborted();
      const author = context.authors.find(
        (candidate) =>
          candidate.id === selected.id &&
          candidate.sourceId === selected.sourceId &&
          candidate.scopeId === selected.scopeId,
      );
      if (!author) throw new Error("原日记作者已不在当前资料中，请重新选择");
      const chronicleQuery = `SELECT c.record_id,c.title,c.content,c.start_time,c.end_time FROM phone_chronicles c
        WHERE EXISTS (SELECT 1 FROM phone_chronicle_characters l WHERE l.chronicle_id=c.record_id AND l.character_id=:author)
        AND datetime(c.start_time) IS NOT NULL AND datetime(c.end_time) IS NOT NULL
        AND datetime(c.start_time)<=datetime(c.end_time) AND datetime(c.end_time)<=datetime(:now)
        ORDER BY datetime(c.end_time) DESC,c.record_id DESC LIMIT 5`;
      const chronicles = await this.#dependencies.data.query({
        ...context.scope,
        sql: chronicleQuery,
        params: { author: author.id, now: context.worldTime },
      });
      if (chronicles.truncated) throw new Error("最近纪要查询被截断");
      const invalid = await this.#dependencies.data.query({
        ...context.scope,
        sql: `SELECT count(*) FROM phone_chronicles c WHERE EXISTS (SELECT 1 FROM phone_chronicle_characters l WHERE l.chronicle_id=c.record_id AND l.character_id=:author) AND (datetime(c.start_time) IS NULL OR datetime(c.end_time) IS NULL OR datetime(c.start_time)>datetime(c.end_time))`,
        params: { author: author.id },
      });
      const recent = await this.#dependencies.data.readRecentChat({ ...context.scope, count: 20 });
      controller.signal.throwIfAborted();
      if (epoch !== this.#epoch) return;
      const skipped = Number(invalid.rows[0]![0]);
      this.#publish({
        authors: context.authors,
        worldTime: context.worldTime,
        status: "generating",
        notice: [
          recent.cleaning.enabled ? `清洗：${recent.cleaning.ruleName}` : "未启用聊天清洗",
          ...(skipped ? [`已跳过 ${skipped} 条剧情时间无效的纪要`] : []),
        ].join("；"),
      });
      const prompt = JSON.stringify({
        日记作者: { 名称: author.name, 资料: author.profileText },
        日记时刻: context.worldTime,
        世界状态: context.world,
        最近纪要: [...chronicles.rows]
          .reverse()
          .map((row) => ({ 标题: row[1], 内容: row[2], 开始: row[3], 结束: row[4] })),
        最近聊天: recent.messages.map((message) => ({
          楼层: message.floor,
          发送者: message.name,
          类型: message.role,
          正文: message.content,
        })),
      });
      const body = await generateDiaryText({
        transport: this.#dependencies.transport,
        connection,
        settings,
        prompt,
        signal: controller.signal,
        onText: (text) => {
          if (epoch === this.#epoch && !controller.signal.aborted) this.#publish({ text });
        },
      });
      controller.signal.throwIfAborted();
      if (epoch !== this.#epoch || this.#dependencies.chat.getSnapshot()?.id !== chatId) return;
      const id = [...crypto.getRandomValues(new Uint8Array(16))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const entry: DiaryEntry = {
        id,
        author: {
          id: author.id,
          name: author.name,
          sourceId: author.sourceId,
          scopeId: author.scopeId,
        },
        worldTime: context.worldTime,
        body,
        createdAt: new Date().toISOString(),
      };
      this.#publish({ status: "saving", text: body, result: entry, unsaved: entry });
      await this.#saveData(
        { ...this.#snapshot.data, entries: [entry, ...this.#snapshot.data.entries] },
        epoch,
      );
      if (epoch === this.#epoch) this.#publish({ status: "complete", unsaved: null });
    } catch (error) {
      if (epoch === this.#epoch)
        this.#publish({
          status: controller.signal.aborted ? "idle" : "error",
          text: this.#snapshot.unsaved ? this.#snapshot.text : "",
          error: controller.signal.aborted ? null : (error as Error).message,
        });
    } finally {
      if (this.#controller === controller) this.#controller = null;
    }
  }

  async retrySave(): Promise<void> {
    const entry = this.#snapshot.unsaved;
    if (!entry) throw new Error("没有待保存的日记");
    const epoch = this.#epoch;
    this.#publish({ status: "saving", error: null });
    try {
      await this.#saveData(
        {
          ...this.#snapshot.data,
          entries: [entry, ...this.#snapshot.data.entries.filter((item) => item.id !== entry.id)],
        },
        epoch,
      );
      if (epoch === this.#epoch) this.#publish({ status: "complete", unsaved: null });
    } catch (error) {
      if (epoch === this.#epoch)
        this.#publish({
          status: "error",
          error: `日记已生成，保存失败：${(error as Error).message}`,
        });
    }
  }

  cancel(): void {
    this.#epoch++;
    this.#controller?.abort();
    this.#controller = null;
    this.#publish({ status: "idle", text: "", error: null, result: null, unsaved: null });
  }

  quit(): void {
    this.cancel();
  }
  dispose(): void {
    this.cancel();
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
    this.#listeners.clear();
  }

  async #saveData(data: DiaryData, epoch = this.#epoch): Promise<void> {
    const chatId = this.#snapshot.chatId;
    if (!chatId || this.#dependencies.chat.getSnapshot()?.id !== chatId)
      throw new Error("当前聊天已变化，未保存日记");
    try {
      await this.#dependencies.storage.write(chatId, data);
      if (epoch === this.#epoch && this.#snapshot.chatId === chatId)
        this.#publish({ data, error: null });
    } catch (error) {
      if (epoch === this.#epoch)
        this.#publish({ status: "error", error: `保存失败：${(error as Error).message}` });
      throw error;
    }
  }

  async #readContext() {
    if (!this.#snapshot.chatId) throw new Error("请先打开一个 ST 聊天");
    const source = this.#dependencies.data.getSnapshot();
    const scope: DataScope = {
      chatIdentity: source.context.chatIdentity,
      scopeId: source.context.scopeId,
    };
    if (!source.context.available || !scope.chatIdentity || !scope.scopeId)
      throw new Error(source.context.message ?? "当前 Memory 资料不可用");
    const schema = await this.#dependencies.data.describe(scope);
    const authors: DiaryAuthor[] = [];
    for (let offset = 0; ; offset += 200) {
      const page = await this.#dependencies.data.query({
        ...scope,
        sql: "SELECT record_id,name,profile_text FROM phone_characters ORDER BY name,record_id LIMIT 200 OFFSET :offset",
        params: { offset },
      });
      if (page.truncated) throw new Error("人物资料查询被截断");
      for (const row of page.rows) {
        if (typeof row[0] !== "string" || typeof row[1] !== "string" || typeof row[2] !== "string")
          throw new Error("人物资料字段格式无效");
        authors.push({
          id: row[0],
          name: row[1],
          profileText: row[2],
          sourceId: schema.sourceId,
          scopeId: schema.scopeId,
        });
      }
      if (page.rows.length < 200) break;
    }
    const state = await this.#dependencies.data.query({
      ...scope,
      sql: "SELECT world_time,datetime(world_time),current_location,weather,clothing,other_scenes FROM phone_world_state LIMIT 2",
    });
    if (state.truncated || state.rows.length !== 1)
      throw new Error("世界状态必须恰好有一条记录，才能确定日记时刻");
    const row = state.rows[0]!;
    if (typeof row[0] !== "string" || typeof row[1] !== "string")
      throw new Error("世界状态缺少有效的剧情时间");
    return {
      authors,
      worldTime: row[0],
      scope,
      world: { 世界时间: row[0], 当前地点: row[2], 天气: row[3], 衣着: row[4], 其他场景: row[5] },
    };
  }

  #binding(): string {
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
    });
  };
  #sourceChanged = (): void => {
    const binding = this.#binding();
    const sourceId = this.#dependencies.data.getSnapshot().sourceId;
    if (
      binding !== this.#sourceBinding ||
      (this.#sourceId !== null && sourceId !== null && sourceId !== this.#sourceId)
    ) {
      this.cancel();
      this.#publish({ authors: [], worldTime: null, notice: null });
    }
    this.#sourceBinding = binding;
    this.#sourceId = sourceId;
  };
  #publish(patch: Partial<DiarySnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of this.#listeners) listener();
  }
}
