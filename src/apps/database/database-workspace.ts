import type {
  DataAppPublic,
  SourceContext,
  DatabaseSchema,
  QueryResult,
  SqlValue,
} from "../data-source/public.ts";
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

/** SQL drafts, results, navigation and scroll belong exclusively to this workspace. */
export class DatabaseWorkspace {
  readonly #data: DataAppPublic;
  readonly #listeners = new Set<() => void>();
  readonly #editors = new Map<string, DatabaseEditor>();
  readonly #unsubscribe: () => void;
  #state: DatabaseState;
  #generation = 0;
  #revision: number;
  #loadedRevision = -1;
  constructor(data: DataAppPublic) {
    this.#data = data;
    const snapshot = data.getSnapshot();
    this.#revision = snapshot.revision;
    this.#state = {
      context: snapshot.context,
      schema: null,
      status: snapshot.context.available ? "idle" : "unavailable",
      stale: false,
      error: null,
      loadedAt: null,
      editor: emptyEditor(),
    };
    this.#unsubscribe = data.subscribe(this.#changed);
  }
  getState = (): DatabaseState => this.#state;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  async load(force = false): Promise<void> {
    if (!force && this.#state.schema && this.#loadedRevision === this.#revision) return;
    const revision = this.#revision;
    const context = this.#data.getSnapshot().context;
    const generation = this.#generation;
    this.#publish({ ...this.#state, status: "loading", error: null });
    try {
      const schema = await this.#data.describe(context, { force });
      if (generation !== this.#generation) return;
      this.#loadedRevision = revision;
      this.#publish({
        ...this.#state,
        schema,
        status: "ready",
        stale: revision !== this.#revision || this.#state.editor.resultStale,
        loadedAt: new Date().toISOString(),
      });
    } catch (error) {
      if (generation === this.#generation)
        this.#publish({
          ...this.#state,
          status: context.available ? "error" : "unavailable",
          error: error instanceof Error ? error.message : String(error),
        });
      throw error;
    }
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
    const context = this.#state.context;
    await this.load();
    return this.#data.query({ ...context, sql, params });
  }
  dispose(): void {
    this.#generation++;
    this.#unsubscribe();
    this.#listeners.clear();
  }
  #changed = (): void => {
    const snapshot = this.#data.getSnapshot();
    const context = snapshot.context;
    const changed = binding(context) !== binding(this.#state.context) || !context.available;
    if (!changed && snapshot.revision === this.#revision) return;
    this.#revision = snapshot.revision;
    if (changed) {
      this.#generation++;
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
