import type {
  BackgroundProvider,
  PhoneBackground,
  SourceContext,
} from "../../features/background/index.ts";
import type { MemoryReadApi } from "./public-read-contract.ts";
import { mapMemoryBackground } from "./map-background.ts";
import { mapMemoryDatabase } from "./map-database.ts";

declare global {
  var STE_MEMORY_API: MemoryReadApi | undefined;
}

/** 负责 Memory 连接和协议转换；缓存、读取去重与页面状态由背景资料功能管理。 */
export class MemoryBackgroundProvider implements BackgroundProvider {
  readonly #listeners = new Set<() => void>();
  #api: MemoryReadApi | undefined;
  #unsubscribe: (() => void) | undefined;

  constructor() {
    // Memory 可能先加载，也可能后加载；已有接口和 ready 通知都需要处理。
    this.#connect();
    window.addEventListener("ste-memory:ready", this.#connect);
  }

  getContext(): SourceContext {
    const base = {
      sourceName: "STE Memory",
      chatIdentity: null,
      chatName: null,
      scopeId: null,
      spaceName: null,
      available: false,
    };
    if (!this.#api)
      return {
        ...base,
        message: "未连接 STE Memory，请启用支持公共读取接口的 Memory 版本并刷新 ST",
      };
    if (this.#api.version !== 1)
      return { ...base, message: `不支持 Memory 读取接口 v${this.#api.version}，请更新两个插件` };
    const context = this.#api.getContext();
    return {
      sourceName: "STE Memory",
      chatIdentity: context.chatIdentity,
      chatName: context.chatName,
      scopeId: context.spaceId,
      spaceName: context.spaceName,
      available: context.available,
      message: context.message,
    };
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async read(): Promise<PhoneBackground> {
    const api = this.#api;
    if (!api || api.version !== 1) throw new Error(this.getContext().message!);
    const { snapshot } = await api.read();
    // await 期间可能换成另一个接口实例，不能接受旧实例返回的结果。
    if (api !== this.#api) throw new Error("Memory 接口已重新连接，请重新读取");
    let background: PhoneBackground;
    try {
      background = mapMemoryBackground(snapshot);
    } catch (error) {
      // 展示映射有独立能力边界；具体错误公开给资料 App，源业务结构仍可供 SQL 检查。
      background = {
        sourceId: "ste-memory",
        scopeId: snapshot.space.id,
        characters: [],
        chronicles: [],
        items: [],
        backgroundError: error instanceof Error ? error.message : String(error),
      };
    }
    return { ...background, database: mapMemoryDatabase(snapshot, background) };
  }

  #connect = (): void => {
    // 重连时先解除旧接口订阅，防止一次提交触发重复刷新。
    this.#unsubscribe?.();
    this.#api = globalThis.STE_MEMORY_API;
    this.#unsubscribe = this.#api?.version === 1 ? this.#api.subscribe(this.#changed) : undefined;
    this.#changed();
  };

  #changed = (): void => {
    for (const listener of this.#listeners) listener();
  };
}
