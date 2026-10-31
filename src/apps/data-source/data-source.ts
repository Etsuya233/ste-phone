import type { PhoneBackground } from "./background.ts";
import type { BackgroundProvider, SourceContext } from "./ports/background-provider.ts";

export interface DataSourceState {
  readonly context: SourceContext;
  readonly status: "unavailable" | "idle" | "loading" | "ready" | "error";
  readonly data: PhoneBackground | null;
  /** 旧快照仍可查看，但新的生成操作必须等待 load 成功。 */
  readonly stale: boolean;
  readonly error: string | null;
  readonly loadedAt: string | null;
}

export interface PhoneDataSource {
  getState(): DataSourceState;
  subscribe(listener: () => void): () => void;
  /** force 跳过有效缓存；已有读取仍共用同一请求。失败会更新状态并向调用者抛出。 */
  load(options?: { force?: boolean }): Promise<PhoneBackground>;
}

function sameBinding(left: SourceContext, right: SourceContext): boolean {
  return left.chatIdentity === right.chatIdentity && left.scopeId === right.scopeId;
}

/**
 * 手机共享的资料读取与缓存，不依赖 Memory、ST 或 React。
 * 实例由入口创建，退出某个 App 不会销毁缓存；来源改变后整份快照失效。
 */
export class BackgroundDataSource implements PhoneDataSource {
  readonly #provider: BackgroundProvider;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: () => void;
  #state: DataSourceState;
  #changeVersion = 0;
  #pendingRead: Promise<PhoneBackground> | undefined;

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
      this.#invalidateCache();
    });
  }

  getState = (): DataSourceState => this.#state;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  load(options: { force?: boolean } = {}): Promise<PhoneBackground> {
    this.synchronize();
    if (!this.#state.context.available)
      return Promise.reject(new Error(this.#state.context.message ?? "数据源不可用"));
    if (this.#pendingRead) return this.#pendingRead;
    if (!options.force && this.#state.data && !this.#state.stale)
      return Promise.resolve(this.#state.data);
    const changeVersion = this.#changeVersion;
    const context = this.#state.context;
    this.#publish({
      ...this.#state,
      status: "loading",
      stale: this.#state.data !== null,
      error: null,
    });
    const pending = this.#readAndPublish(context, changeVersion).finally(() => {
      // 旧读取结束时，新的读取可能已经开始，不能清除新请求。
      if (this.#pendingRead === pending) this.#pendingRead = undefined;
    });
    this.#pendingRead = pending;
    return pending;
  }

  /** Query clients also reconcile binding before using a cached schema. */
  synchronize(): void {
    const current = this.#provider.getContext();
    if (
      !sameBinding(this.#state.context, current) ||
      current.available !== this.#state.context.available
    )
      this.#invalidateCache();
  }

  dispose(): void {
    this.#changeVersion++;
    this.#unsubscribe();
    this.#listeners.clear();
  }

  async #readAndPublish(context: SourceContext, changeVersion: number): Promise<PhoneBackground> {
    try {
      const data = await this.#provider.read();
      // 同一聊天内的资料更新也会改变版本，仅检查聊天 ID 无法识别这种旧结果。
      if (
        changeVersion !== this.#changeVersion ||
        !sameBinding(context, this.#provider.getContext())
      )
        throw new Error("资料或聊天已变化，本次读取已取消");
      if (data.scopeId !== context.scopeId) throw new Error("数据源返回了其他记忆空间的资料");

      // App 可以持有这份输入继续生成；下一次刷新只替换缓存，不修改已有快照。
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
    } catch (error) {
      // 错误归属与成功结果相同：旧请求失败也不能覆盖新聊天的状态。
      if (changeVersion === this.#changeVersion)
        this.#publish({
          ...this.#state,
          status: "error",
          stale: this.#state.data !== null,
          error: error instanceof Error ? error.message : String(error),
        });
      throw error;
    }
  }

  #invalidateCache(): void {
    const context = this.#provider.getContext();
    const retain = context.available && sameBinding(this.#state.context, context);
    this.#changeVersion++;
    this.#pendingRead = undefined;
    // 同范围更新可继续展示旧快照；切换聊天或来源不可用时立即清空。
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
