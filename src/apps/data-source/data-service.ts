import type { DatabaseProvider } from "./ports/database-provider.ts";
import { BackgroundDataSource } from "./data-source.ts";
import { QueryBackgroundProvider } from "./query-background-provider.ts";
import type { DatabaseSchema } from "./database.ts";
import type {
  DataAppPublic,
  DataScope,
  DataQuery,
  BackgroundRead,
  DataSourceSnapshot,
} from "./public.ts";
const binding = (scope: DataScope) => JSON.stringify([scope.chatIdentity, scope.scopeId]);

/** Owns external query structures and caches independently of every editor session. */
export class PhoneDataService implements DataAppPublic {
  readonly #provider: DatabaseProvider;
  readonly #background: BackgroundDataSource;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: (() => void)[];
  #snapshot: DataSourceSnapshot;
  #schema: DatabaseSchema | null = null;
  #dirty = true;
  #generation = 0;
  #revision = 0;
  #pending: Promise<DatabaseSchema> | undefined;
  constructor(provider: DatabaseProvider) {
    this.#provider = provider;
    // Register invalidation before the background cache so subscribers receive one coherent revision.
    const unsubscribeProvider = provider.subscribe(this.#sourceChanged);
    this.#background = new BackgroundDataSource(new QueryBackgroundProvider(this, provider));
    this.#snapshot = Object.freeze({
      ...this.#background.getState(),
      context: Object.freeze({ ...provider.getContext() }),
      revision: 0,
      sourceId: null,
    });
    this.#unsubscribe = [unsubscribeProvider, this.#background.subscribe(() => this.#publish())];
  }

  getSnapshot = (): DataSourceSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  async readBackground(request: BackgroundRead) {
    request = { ...request };
    this.#assertScope(request);
    const result = await this.#background.load({ force: request.force });
    this.#assertScope(request);
    return result;
  }
  async describe(
    request: DataScope,
    options: { readonly force?: boolean } = {},
  ): Promise<DatabaseSchema> {
    request = { ...request };
    this.#assertScope(request);
    if (!this.#provider.getContext().available)
      throw new Error(this.#provider.getContext().message ?? "数据源不可用");
    if (this.#pending) return this.#pending;
    if (!options.force && !this.#dirty && this.#schema) return this.#schema;
    const generation = this.#generation;
    const revision = this.#revision;
    const pending = (async () => {
      const schema = await this.#provider.describe();
      this.#assertScope(request, generation);
      if (schema.scopeId !== request.scopeId) throw new Error("数据源返回了其他记忆空间的结构");
      await this.#provider.register(schema);
      this.#assertScope(request, generation);
      for (const object of schema.objects) {
        for (const column of object.columns) {
          if (column.reference) Object.freeze(column.reference);
          Object.freeze(column);
        }
        Object.freeze(object.columns);
        Object.freeze(object);
      }
      Object.freeze(schema.objects);
      Object.freeze(schema);
      this.#schema = schema;
      this.#dirty = revision !== this.#revision;
      if (this.#snapshot.sourceId !== schema.sourceId) this.#publish();
      return schema;
    })().finally(() => {
      if (this.#pending === pending) this.#pending = undefined;
    });
    this.#pending = pending;
    return pending;
  }
  async query(request: DataQuery) {
    // SQL and parameters belong to the invocation, even while schema preparation awaits.
    request = { ...request, params: request.params ? { ...request.params } : undefined };
    this.#assertScope(request);
    const generation = this.#generation;
    const schema = await this.describe(request);
    this.#assertScope(request, generation);
    const result = await this.#provider.query(schema, request.sql, request.params);
    this.#assertScope(request, generation);
    // Caller-owned results never share writable arrays with the adapter.
    return Object.freeze({
      ...result,
      columns: Object.freeze([...result.columns]),
      rows: Object.freeze(result.rows.map((row) => Object.freeze([...row]))),
    });
  }
  dispose(): void {
    this.#generation++;
    for (const unsubscribe of this.#unsubscribe) unsubscribe();
    this.#background.dispose();
    this.#listeners.clear();
  }
  #sourceChanged = (): void => {
    const context = this.#provider.getContext();
    if (binding(context) !== binding(this.#snapshot.context) || !context.available) {
      this.#generation++;
      this.#pending = undefined;
      this.#schema = null;
    }
    this.#revision++;
    this.#dirty = true;
  };
  #assertScope(request: DataScope, generation?: number): void {
    const context = this.#provider.getContext();
    if (
      binding(context) !== binding(this.#snapshot.context) ||
      context.available !== this.#snapshot.context.available
    ) {
      this.#sourceChanged();
      this.#background.synchronize();
    }
    if (
      (generation !== undefined && generation !== this.#generation) ||
      binding(request) !== binding(context)
    )
      throw new Error("资料或聊天已变化，本次查询已取消");
  }
  #publish(): void {
    this.#snapshot = Object.freeze({
      ...this.#background.getState(),
      context: Object.freeze({ ...this.#provider.getContext() }),
      revision: this.#revision,
      sourceId: this.#schema?.sourceId ?? this.#background.getState().data?.sourceId ?? null,
    });
    for (const listener of this.#listeners) listener();
  }
}
