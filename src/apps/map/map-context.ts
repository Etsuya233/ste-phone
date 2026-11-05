import type { DataAppPublic, DataScope, DatabaseSchema, SqlValue } from "../data-source/public.ts";
import { quoteIdentifier } from "../data-source/public.ts";

export function mapScope(data: DataAppPublic): DataScope {
  const { context } = data.getSnapshot();
  if (!context.available || !context.chatIdentity || !context.scopeId) {
    throw new Error(context.message ?? "当前 Memory 资料不可用");
  }
  return { chatIdentity: context.chatIdentity, scopeId: context.scopeId };
}
export const stableMapKey = (schema: DatabaseSchema): string =>
  JSON.stringify([schema.sourceId, schema.stableScopeId]);

export interface MapStory {
  sourceId: string;
  stableScopeId: string;
  records: { table: string; rows: Record<string, SqlValue | undefined>[] }[];
  summary: string;
}

/** 来源表保持原字段与稳定记录身份，模型据此识别地点，禁止按显示名覆盖。 */
export async function readMapStory(
  data: DataAppPublic,
  signal: AbortSignal,
  selectedTables: string[],
): Promise<MapStory> {
  const scope = mapScope(data);
  const schema = await data.describe(scope);
  const tables = selectedTables.map((name) => {
    const table = schema.objects.find(
      (table) => table.name === name && table.name.startsWith("src_"),
    );
    if (!table) {
      throw new Error(`所选剧情资料表已不存在：${name}`);
    }
    return table;
  });
  const records = [];
  for (const table of tables) {
    const rows = [];
    for (let offset = 0; ; offset += 100) {
      signal.throwIfAborted();
      const result = await data.query({
        ...scope,
        sql: `SELECT * FROM ${quoteIdentifier(table.name)} ORDER BY _phone_stable_record_id LIMIT 100 OFFSET :offset`,
        params: { offset },
      });
      if (result.truncated) {
        throw new Error(`地图资料查询被截断：${table.name}`);
      }
      rows.push(
        ...result.rows.map((row) =>
          Object.fromEntries(result.columns.map((column, index) => [column, row[index]])),
        ),
      );
      if (result.rows.length < 100) {
        break;
      }
    }
    records.push({
      table: table.name,
      description: table.description,
      columns: table.columns,
      rows,
    });
  }
  const summary = await data.readSummary(scope);
  signal.throwIfAborted();
  const current = await data.describe(scope);
  if (current.scopeId !== schema.scopeId || stableMapKey(current) !== stableMapKey(schema)) {
    throw new Error("地图取材期间资料空间已变化");
  }
  return { sourceId: schema.sourceId, stableScopeId: schema.stableScopeId, records, summary };
}
