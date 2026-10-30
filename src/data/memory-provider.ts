import type { BackgroundProvider, PhoneBackground, SourceContext } from "./background.ts";
import type { MemoryReadApi } from "./memory-contract.ts";
import { mapMemoryBackground } from "./memory-mapping.ts";

declare global {
  var STE_MEMORY_API: MemoryReadApi | undefined;
}

export class MemoryBackgroundProvider implements BackgroundProvider {
  readonly #listeners = new Set<() => void>();
  #api: MemoryReadApi | undefined;
  #unsubscribe: (() => void) | undefined;

  constructor() {
    this.#connect();
    window.addEventListener("ste-memory:ready", this.#connect);
  }

  #connect = (): void => {
    this.#unsubscribe?.();
    this.#api = globalThis.STE_MEMORY_API;
    this.#unsubscribe = this.#api?.version === 1 ? this.#api.subscribe(this.#changed) : undefined;
    this.#changed();
  };

  #changed = (): void => {
    for (const listener of this.#listeners) listener();
  };

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
    if (api !== this.#api) throw new Error("Memory 接口已重新连接，请重新读取");
    return mapMemoryBackground(snapshot);
  }
}
