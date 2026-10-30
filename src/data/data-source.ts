import type {
  BackgroundProvider,
  DataSourceState,
  PhoneBackground,
  PhoneDataSource,
} from "./background.ts";

function sameBinding(left: DataSourceState["context"], right: DataSourceState["context"]): boolean {
  return left.chatIdentity === right.chatIdentity && left.scopeId === right.scopeId;
}

/** One cache per mounted plugin, shared by apps and independent of their navigation state. */
export class BackgroundDataSource implements PhoneDataSource {
  readonly #provider: BackgroundProvider;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: () => void;
  #state: DataSourceState;
  #generation = 0;
  #pending: Promise<PhoneBackground> | undefined;

  constructor(provider: BackgroundProvider) {
    this.#provider = provider;
    const context = provider.getContext();
    this.#state = {
      context,
      status: context.available ? "idle" : "unavailable",
      data: null,
      stale: false,
      error: null,
      loadedAt: null,
    };
    this.#unsubscribe = provider.subscribe(() => {
      this.#invalidate();
      if (this.#state.context.available && this.#listeners.size > 0)
        void this.load().catch(() => {});
    });
  }

  getState = (): DataSourceState => this.#state;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  load(options: { force?: boolean } = {}): Promise<PhoneBackground> {
    const current = this.#provider.getContext();
    if (
      !sameBinding(this.#state.context, current) ||
      current.available !== this.#state.context.available
    )
      this.#invalidate();
    if (!this.#state.context.available)
      return Promise.reject(new Error(this.#state.context.message ?? "数据源不可用"));
    if (this.#pending) return this.#pending;
    if (!options.force && this.#state.data && !this.#state.stale)
      return Promise.resolve(this.#state.data);
    const generation = this.#generation;
    const context = this.#state.context;
    this.#publish({
      ...this.#state,
      status: "loading",
      stale: this.#state.data !== null,
      error: null,
    });
    const pending = this.#provider
      .read()
      .then((data) => {
        if (generation !== this.#generation || !sameBinding(context, this.#provider.getContext()))
          throw new Error("资料或聊天已变化，本次读取已取消");
        if (data.scopeId !== context.scopeId) throw new Error("数据源返回了其他记忆空间的资料");
        // Consumers may hold this snapshot while the cache is replaced by a later read.
        for (const entry of [...data.characters, ...data.chronicles, ...data.items])
          Object.freeze(entry);
        Object.freeze(data.characters);
        Object.freeze(data.chronicles);
        Object.freeze(data.items);
        Object.freeze(data);
        this.#publish({
          context: this.#provider.getContext(),
          status: "ready",
          data,
          stale: false,
          error: null,
          loadedAt: new Date().toISOString(),
        });
        return data;
      })
      .catch((error: unknown) => {
        if (generation === this.#generation)
          this.#publish({
            ...this.#state,
            status: "error",
            stale: this.#state.data !== null,
            error: error instanceof Error ? error.message : String(error),
          });
        throw error;
      })
      .finally(() => {
        if (this.#pending === pending) this.#pending = undefined;
      });
    this.#pending = pending;
    return pending;
  }

  dispose(): void {
    this.#generation++;
    this.#unsubscribe();
    this.#listeners.clear();
  }

  #invalidate(): void {
    const context = this.#provider.getContext();
    const retain = context.available && sameBinding(this.#state.context, context);
    this.#generation++;
    this.#pending = undefined;
    this.#publish({
      context,
      status: context.available ? "idle" : "unavailable",
      data: retain ? this.#state.data : null,
      stale: retain && this.#state.data !== null,
      error: null,
      loadedAt: retain ? this.#state.loadedAt : null,
    });
  }

  #publish(state: DataSourceState): void {
    this.#state = state;
    for (const listener of this.#listeners) listener();
  }
}
