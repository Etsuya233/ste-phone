import type { SourceContext } from "../background/index.ts";
import type { DatabaseProvider, DatabaseSchema, QueryResult, SqlValue } from "./database.ts";

export interface DatabaseEditor {
  readonly tab: "objects" | "sql";
  readonly search: string;
  readonly selected: string | null;
  readonly sql: string;
  readonly result: QueryResult | null;
  readonly resultStale: boolean;
  readonly queryError: string | null;
  readonly running: boolean;
  readonly scroll: Readonly<Record<string, number>>;
}
export interface DatabaseState {
  readonly context: SourceContext;
  readonly schema: DatabaseSchema | null;
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
  resultStale: false,
  queryError: null,
  running: false,
  scroll: {},
});
const binding = (context: SourceContext) => JSON.stringify([context.chatIdentity, context.scopeId]);

/** 只持有结构、查询结果与编辑会话；记录变更仅标过期，下一次操作才检查结构。 */
export class PhoneDatabaseService {
  readonly #provider: DatabaseProvider;
  readonly #listeners = new Set<() => void>();
  readonly #editors = new Map<string, DatabaseEditor>();
  readonly #unsubscribe: () => void;
  #state: DatabaseState;
  #generation = 0;
  #revision = 0;
  #dirty = true;
  #pending: Promise<void> | undefined;

  constructor(provider: DatabaseProvider) {
    this.#provider = provider;
    const context = provider.getContext();
    this.#state = {
      context,
      schema: null,
      status: context.available ? "idle" : "unavailable",
      stale: false,
      error: null,
      loadedAt: null,
      editor: emptyEditor(),
    };
    this.#unsubscribe = provider.subscribe(this.#changed);
  }
  getState = (): DatabaseState => this.#state;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  load(force = false): Promise<void> {
    const current = this.#provider.getContext();
    if (
      binding(current) !== binding(this.#state.context) ||
      current.available !== this.#state.context.available
    )
      this.#changed();
    if (!current.available) return Promise.reject(new Error(current.message ?? "数据源不可用"));
    if (this.#pending) return this.#pending;
    if (!force && !this.#dirty && this.#state.schema) return Promise.resolve();
    const generation = this.#generation;
    const revision = this.#revision;
    this.#publish({ ...this.#state, status: "loading", error: null });
    const pending = this.#prepare(generation, revision).finally(() => {
      if (this.#pending === pending) this.#pending = undefined;
    });
    this.#pending = pending;
    return pending;
  }
  edit(patch: Partial<DatabaseEditor>): void {
    const editor = { ...this.#state.editor, ...patch };
    this.#editors.set(binding(this.#state.context), editor);
    this.#publish({ ...this.#state, editor });
  }
  async execute(): Promise<void> {
    const chat = binding(this.#state.context);
    const generation = this.#generation;
    const revision = this.#revision;
    const sql = this.#state.editor.sql;
    this.edit({ running: true, queryError: null });
    try {
      const result = await this.query(sql);
      if (chat !== binding(this.#state.context) || generation !== this.#generation) return;
      this.edit({
        result,
        resultStale: revision !== this.#revision,
        running: false,
        queryError: null,
      });
      this.#publish({ ...this.#state, stale: this.#state.editor.resultStale });
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
    const generation = this.#generation;
    const chat = binding(this.#state.context);
    await loading;
    this.#assertBinding(generation, chat);
    const result = await this.#provider.query(this.#state.schema!, sql, params);
    this.#assertBinding(generation, chat);
    return result;
  }
  dispose(): void {
    this.#generation++;
    this.#unsubscribe();
    this.#listeners.clear();
  }
  async #prepare(generation: number, revision: number): Promise<void> {
    const chat = binding(this.#state.context);
    try {
      const schema = await this.#provider.describe();
      this.#assertBinding(generation, chat);
      // Memory 保证数据 publish 后重建已注册视图；相同 schemaKey 无需重新注册。
      await this.#provider.register(schema);
      this.#assertBinding(generation, chat);
      this.#dirty = revision !== this.#revision;
      this.#publish({
        ...this.#state,
        schema,
        status: "ready",
        error: null,
        stale: this.#dirty || this.#state.editor.resultStale,
        loadedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (generation === this.#generation)
        this.#publish({
          ...this.#state,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
          stale: this.#state.schema !== null,
        });
      throw error;
    }
  }
  #assertBinding(generation: number, chat: string): void {
    if (generation !== this.#generation || chat !== binding(this.#provider.getContext()))
      throw new Error("聊天已变化，本次查询已取消");
  }
  #changed = (): void => {
    const context = this.#provider.getContext();
    const changed = binding(context) !== binding(this.#state.context) || !context.available;
    this.#revision++;
    this.#dirty = true;
    if (changed) {
      this.#generation++;
      this.#pending = undefined;
      const editor = this.#editors.get(binding(context)) ?? emptyEditor();
      const restored = { ...editor, resultStale: editor.result !== null };
      this.#editors.set(binding(context), restored);
      this.#publish({
        context,
        schema: null,
        status: context.available ? "idle" : "unavailable",
        stale: restored.resultStale,
        error: null,
        loadedAt: null,
        editor: restored,
      });
    } else {
      const editor = { ...this.#state.editor, resultStale: this.#state.editor.result !== null };
      this.#editors.set(binding(context), editor);
      this.#publish({
        ...this.#state,
        context,
        stale: this.#state.schema !== null || editor.resultStale,
        editor,
      });
    }
  };
  #publish(state: DatabaseState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}
