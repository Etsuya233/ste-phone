import type { DatabaseProvider } from "../../apps/data-source/ports/database-provider.ts";
import type { DatabaseSchema, QueryResult, SqlValue } from "../../apps/data-source/database.ts";
import type { SourceContext } from "../../apps/data-source/ports/background-provider.ts";
import type { MemoryReadApi } from "./public-read-contract.ts";
import { mapMemoryDatabase } from "./map-database.ts";

declare global {
  var STE_MEMORY_API: MemoryReadApi | undefined;
}

/** Memory 公开数据库 capability 的适配边界。Phone 从未调用公开快照 read。 */
export class MemoryDatabaseProvider implements DatabaseProvider {
  readonly #listeners = new Set<() => void>();
  #api: MemoryReadApi | undefined;
  #unsubscribe: (() => void) | undefined;
  readonly #registered = new Map<string, string>();
  constructor() {
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
    const api = this.#api;
    if (!api)
      return { ...base, message: "未连接 STE Memory，请启用支持数据库接口的 Memory 版本并刷新 ST" };
    if (api.version !== 1)
      return { ...base, message: `不支持 Memory 读取接口 v${api.version}，请更新两个插件` };
    const context = api.getContext();
    return {
      ...base,
      chatIdentity: context.chatIdentity,
      chatName: context.chatName,
      scopeId: context.spaceId,
      spaceName: context.spaceName,
      available: context.available && api.database?.version === 1,
      message:
        api.database?.version === 1
          ? context.message
          : "Memory 缺少 database v1 capability，请更新 Memory",
    };
  }
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  async describe(): Promise<DatabaseSchema> {
    const api = this.#api!;
    const context = this.getContext();
    if (!context.available) throw new Error(context.message!);
    const description = await api.database!.describe({
      chatIdentity: context.chatIdentity!,
      spaceId: context.scopeId!,
    });
    if (api !== this.#api) throw new Error("Memory 接口已重新连接，请重新查询");
    if (description.space.id !== context.scopeId) throw new Error("Memory 返回了其他空间的结构");
    return mapMemoryDatabase(description);
  }
  async register(schema: DatabaseSchema): Promise<void> {
    const api = this.#api!;
    const context = this.getContext();
    const key = JSON.stringify([context.chatIdentity, schema.scopeId]);
    const identity = JSON.stringify([schema.databaseKey, schema.schemaKey]);
    if (this.#registered.get(key) === identity) return;
    await api.database!.registerViews({
      chatIdentity: context.chatIdentity!,
      spaceId: schema.scopeId,
      schemaKey: schema.schemaKey,
      namespace: "ste_phone",
      views: schema.objects.map((object) => ({
        name: object.name,
        select: object.select!,
        columns: object.columns.map((column) => column.name),
      })),
    });
    if (api !== this.#api) throw new Error("Memory 接口已重新连接，请重新查询");
    this.#registered.set(key, identity);
  }
  async query(
    schema: DatabaseSchema,
    sql: string,
    params?: Readonly<Record<string, SqlValue>>,
  ): Promise<QueryResult> {
    const api = this.#api!;
    const context = this.getContext();
    if (!context.available || context.scopeId !== schema.scopeId)
      throw new Error(context.message ?? "当前空间已变化");
    const result = await api.database!.query({
      chatIdentity: context.chatIdentity!,
      spaceId: schema.scopeId,
      schemaKey: schema.schemaKey,
      namespace: "ste_phone",
      sql,
      params,
      maxRows: 200,
      budgetMs: 750,
    });
    if (api !== this.#api) throw new Error("Memory 接口已重新连接，请重新查询");
    return result;
  }
  #connect = (): void => {
    this.#unsubscribe?.();
    this.#api = globalThis.STE_MEMORY_API;
    this.#registered.clear();
    this.#unsubscribe = this.#api?.version === 1 ? this.#api.subscribe(this.#changed) : undefined;
    this.#changed();
  };
  #changed = (): void => {
    for (const listener of this.#listeners) listener();
  };
}
