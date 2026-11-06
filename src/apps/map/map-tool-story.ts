import { quoteIdentifier, type DataAppPublic, type DatabaseSchema } from "../data-source/public.ts";
import { mapScope, stableMapKey } from "./map-context.ts";

const MAX_PAGE_SIZE = 50;
const MAX_OFFSET = 100_000;

/** Each generation owns its reader and the stable IDs actually returned to its model. */
export function createMapStoryReader(
  data: DataAppPublic,
  signal: AbortSignal,
  expectedScopeKey?: string,
) {
  const memoryIds = new Set<string>();
  const initial = data.getSnapshot().context;
  let binding: string | undefined;

  function currentScope() {
    signal.throwIfAborted();
    const scope = mapScope(data);
    if (scope.chatIdentity !== initial.chatIdentity || scope.scopeId !== initial.scopeId) {
      throw new Error("地图取材期间资料空间已变化");
    }
    return scope;
  }

  async function describe(): Promise<DatabaseSchema> {
    const schema = await data.describe(currentScope());
    currentScope();
    if (expectedScopeKey !== undefined && stableMapKey(schema) !== expectedScopeKey) {
      throw new Error("地图取材期间稳定资料空间已变化");
    }
    const key = JSON.stringify([schema.scopeId, stableMapKey(schema), schema.databaseKey]);
    if (binding !== undefined && binding !== key) {
      throw new Error("地图取材期间资料空间已变化");
    }
    binding = key;
    return schema;
  }

  return {
    memoryIds,
    async directory() {
      const schema = await describe();
      return {
        sourceId: schema.sourceId,
        stableScopeId: schema.stableScopeId,
        tables: schema.objects.filter((table) => table.name.startsWith("src_")),
      };
    },
    async records(table: string, limit: number, offset: number) {
      if (!table.startsWith("src_")) {
        throw new Error(`不是可读取的剧情资料表：${table}`);
      }
      if (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > MAX_PAGE_SIZE ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > MAX_OFFSET
      ) {
        throw new Error(
          `资料分页要求 limit 为 1–${MAX_PAGE_SIZE}，offset 为 0–${MAX_OFFSET} 的整数`,
        );
      }
      const schema = await describe();
      if (!schema.objects.some((item) => item.name === table)) {
        throw new Error(`剧情资料表已不存在：${table}`);
      }
      const result = await data.query({
        ...currentScope(),
        sql: `SELECT * FROM ${quoteIdentifier(table)} ORDER BY _phone_stable_record_id LIMIT :count OFFSET :offset`,
        params: { count: limit + 1, offset },
      });
      await describe();
      if (result.truncated) {
        throw new Error(`地图资料查询被截断：${table}`);
      }
      const idColumn = result.columns.indexOf("_phone_stable_record_id");
      if (idColumn < 0) {
        throw new Error(`剧情资料表缺少稳定记录身份：${table}`);
      }
      const rows = result.rows.slice(0, limit).map((row) => {
        const id = row[idColumn];
        if (typeof id === "string" && id) {
          memoryIds.add(id);
        }
        return Object.fromEntries(result.columns.map((column, index) => [column, row[index]]));
      });
      return {
        table,
        offset,
        rows,
        nextOffset: result.rows.length > limit ? offset + limit : null,
      };
    },
    async summary() {
      await describe();
      const summary = await data.readSummary(currentScope());
      await describe();
      return { summary };
    },
  };
}
