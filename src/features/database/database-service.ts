import type { PhoneDataSource, SourceContext } from "../background/index.ts";
import type { DatabaseEngine, DatabaseSnapshot, QueryResult, SqlValue } from "./database.ts";

export interface DatabaseEditor {
  readonly tab: "objects" | "sql";
  readonly search: string;
  readonly selected: string | null;
  readonly sql: string;
  readonly result: QueryResult | null;
  readonly queryError: string | null;
  readonly running: boolean;
  readonly scroll: Readonly<Record<string, number>>;
}
export interface DatabaseState {
  readonly context: SourceContext;
  readonly snapshot: DatabaseSnapshot | null;
  readonly status: "idle" | "loading" | "ready" | "error" | "unavailable";
  readonly stale: boolean;
  readonly error: string | null;
  readonly loadedAt: string | null;
  readonly editor: DatabaseEditor;
}
const emptyEditor = (): DatabaseEditor => ({
  tab: "objects",
  search: "",
  selected: null,
  sql: "SELECT * FROM phone_characters LIMIT 50;",
  result: null,
  queryError: null,
  running: false,
  scroll: {},
});
const binding = (context: SourceContext) => JSON.stringify([context.chatIdentity, context.scopeId]);

/** 共享背景资料的读取与缓存；仅有数据库 App 订阅时持续导入，关闭后保留内存编辑会话。 */
export class PhoneDatabaseService {
  readonly #source: PhoneDataSource;
  readonly #engine: DatabaseEngine;
  readonly #listeners = new Set<() => void>();
  readonly #editors = new Map<string, DatabaseEditor>();
  #unsubscribe: (() => void) | undefined;
  #state: DatabaseState;
  #generation = 0;
  #sourceStale = false;
  #importing: { snapshot: DatabaseSnapshot; promise: Promise<void> } | undefined;

  constructor(source: PhoneDataSource, engine: DatabaseEngine) {
    this.#source = source;
    this.#engine = engine;
    this.#state = {
      context: source.getState().context,
      snapshot: null,
      status: "idle",
      stale: false,
      error: null,
      loadedAt: null,
      editor: emptyEditor(),
    };
  }
  getState = (): DatabaseState => this.#state;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    if (!this.#unsubscribe) {
      this.#unsubscribe = this.#source.subscribe(this.#sync);
      this.#sync();
    }
    return () => {
      this.#listeners.delete(listener);
      if (!this.#listeners.size) {
        this.#unsubscribe?.();
        this.#unsubscribe = undefined;
      }
    };
  };
  async load(force = false): Promise<void> {
    const read = this.#source.load({ force });
    this.#sync();
    try {
      await read;
    } catch (error) {
      this.#sync();
      throw error;
    }
    this.#sync();
    await this.#importing?.promise;
  }
  edit(patch: Partial<DatabaseEditor>): void {
    const editor = { ...this.#state.editor, ...patch };
    this.#editors.set(binding(this.#state.context), editor);
    this.#publish({ ...this.#state, editor });
  }
  async execute(): Promise<void> {
    const chat = binding(this.#state.context);
    const sql = this.#state.editor.sql;
    const generation = this.#generation;
    this.edit({ running: true, queryError: null });
    try {
      const result = await this.query(sql);
      if (chat !== binding(this.#state.context)) return;
      this.edit({ result, running: false, queryError: null });
    } catch (error) {
      if (chat === binding(this.#state.context) && generation === this.#generation)
        this.edit({
          running: false,
          queryError: error instanceof Error ? error.message : String(error),
        });
    } finally {
      const editor = this.#editors.get(chat);
      if (editor?.running) {
        if (chat === binding(this.#state.context)) this.edit({ running: false });
        else this.#editors.set(chat, { ...editor, running: false });
      }
    }
  }
  async query(sql: string, params?: Readonly<Record<string, SqlValue>>): Promise<QueryResult> {
    const loading = this.load();
    const chat = binding(this.#state.context);
    const generation = this.#generation;
    await loading;
    if (chat !== binding(this.#state.context) || generation !== this.#generation)
      throw new Error("聊天已变化，本次查询已取消");
    if (!this.#state.snapshot) throw new Error(this.#state.error ?? "当前聊天数据库未就绪");
    const result = await this.#engine.query(chat, sql, params);
    if (chat !== binding(this.#state.context) || generation !== this.#generation)
      throw new Error("聊天已变化，本次查询已取消");
    return result;
  }
  dispose(): void {
    this.#generation++;
    this.#unsubscribe?.();
    this.#engine.dispose();
    this.#listeners.clear();
  }

  #sync = (): void => {
    const source = this.#source.getState();
    if (source.stale && !this.#sourceStale) this.#generation++;
    this.#sourceStale = source.stale;
    if (binding(source.context) !== binding(this.#state.context)) {
      this.#generation++;
      this.#importing = undefined;
      this.#publish({
        context: source.context,
        snapshot: null,
        status: source.status,
        stale: false,
        error: source.error,
        loadedAt: null,
        editor: this.#editors.get(binding(source.context)) ?? emptyEditor(),
      });
    }
    const snapshot = source.data?.database;
    if (source.status !== "ready" || source.stale) {
      this.#publish({
        ...this.#state,
        context: source.context,
        status: source.status,
        stale: this.#state.snapshot !== null,
        error: source.error,
      });
      return;
    }
    if (!snapshot) {
      this.#publish({
        ...this.#state,
        status: "error",
        error: "当前资料来源没有提供结构化数据库快照",
      });
      return;
    }
    if (snapshot === this.#state.snapshot) {
      this.#publish({ ...this.#state, status: "ready", stale: false, error: null });
      return;
    }
    if (snapshot === this.#importing?.snapshot) return;
    this.#publish({
      ...this.#state,
      status: "loading",
      stale: this.#state.snapshot !== null,
      error: null,
    });
    const generation = this.#generation;
    const contextBinding = binding(source.context);
    const promise = this.#engine
      .replace(contextBinding, snapshot)
      .then(() => {
        if (
          generation !== this.#generation ||
          this.#importing?.snapshot !== snapshot ||
          this.#source.getState().data?.database !== snapshot ||
          this.#source.getState().stale
        )
          return;
        this.#publish({
          ...this.#state,
          snapshot,
          status: "ready",
          stale: false,
          error: null,
          loadedAt: new Date().toISOString(),
        });
      })
      .catch((error: unknown) => {
        if (generation === this.#generation && this.#importing?.snapshot === snapshot)
          this.#publish({
            ...this.#state,
            status: "error",
            stale: this.#state.snapshot !== null,
            error: error instanceof Error ? error.message : String(error),
          });
        throw error;
      })
      .finally(() => {
        if (this.#importing?.promise === promise) this.#importing = undefined;
      });
    this.#importing = { snapshot, promise };
    void promise.catch(() => {});
  };
  #publish(state: DatabaseState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}
