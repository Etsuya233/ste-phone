import type {
  DatabaseColumn,
  DatabaseObject,
  DatabaseSnapshot,
  SqlValue,
} from "../../features/database/index.ts";
import { identifierKey, quoteIdentifier as q } from "../../features/database/index.ts";
import type { PhoneBackground } from "../../features/background/index.ts";
import type { MemoryField, MemorySnapshot } from "./public-read-contract.ts";

const column = (
  name: string,
  description: string,
  type: DatabaseColumn["type"] = "TEXT",
): DatabaseColumn => ({ name, description, type });
const identity = [
  column("source_id", "来源持久身份"),
  column("scope_id", "来源空间持久身份"),
  column("record_id", "来源记录 ID；改名不改变身份"),
];
const sourceIdentity = [
  column("_phone_source_id", "来源持久身份"),
  column("_phone_scope_id", "来源空间持久身份"),
  column("_phone_record_id", "来源记录 ID"),
  column("_phone_created_at", "来源记录创建时间；不代表剧情时间"),
  column("_phone_updated_at", "来源记录更新时间"),
  column("_phone_display_text", "来源保存的显示文本"),
  column("_phone_payload_json", "完整 payload JSON，key 为原始字段 ID"),
  column("_phone_record_json", "完整公开记录 JSON"),
  column("_phone_profile_text", "手机展示派生正文；原始字段单独保留"),
];

/** 公共快照完整导入。phone_* 为稳定手机契约，src_* 逐字保留源表 key。 */
export function mapMemoryDatabase(
  snapshot: MemorySnapshot,
  background: PhoneBackground,
): DatabaseSnapshot {
  const objects: DatabaseObject[] = [];
  const tableNames = new Map(snapshot.tables.map((table) => [table.id, `src_${table.key}`]));
  const tableKeys = new Set<string>();
  const fieldsByTable = new Map(
    snapshot.tables.map((table) => [
      table.id,
      snapshot.fields
        .filter((field) => field.tableId === table.id)
        .toSorted((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    ]),
  );
  const recordsById = new Map(snapshot.records.map((record) => [record.id, record]));
  const profiles = new Map<string, string>([
    ...background.characters.map((entry) => [entry.id, entry.profileText] as const),
    ...background.chronicles.map((entry) => [entry.id, entry.content] as const),
    ...background.items.map((entry) => [entry.id, entry.description] as const),
  ]);
  for (const table of snapshot.tables) {
    const name = tableNames.get(table.id)!;
    const key = identifierKey(name);
    if (tableKeys.has(key)) throw new Error(`SQLite 表名碰撞（忽略 ASCII 大小写）：${name}`);
    tableKeys.add(key);
    q(name);
    const fields = fieldsByTable.get(table.id)!;
    const names = new Set(sourceIdentity.map((item) => identifierKey(item.name)));
    const columns = fields.map((field): DatabaseColumn => {
      q(field.key);
      const key = identifierKey(field.key);
      if (key.startsWith("_phone_") || names.has(key))
        throw new Error(`SQLite 列名碰撞：${name}.${field.key}（_phone_ 为保留前缀）`);
      names.add(key);
      const multiple = ["multi_reference", "multi_select", "short_text_list"].includes(field.type);
      const referenceTable =
        field.referenceTableId === null ? null : tableNames.get(field.referenceTableId);
      if (field.referenceTableId && !referenceTable)
        throw new Error(`引用字段 ${table.key}.${field.key} 的目标表不存在`);
      return {
        name: field.key,
        type:
          field.type === "integer" || field.type === "boolean"
            ? "INTEGER"
            : field.type === "decimal"
              ? "REAL"
              : "TEXT",
        description: `${field.name} · ${field.type}${multiple ? " · JSON 数组，使用 json_each 展开" : ""}${field.enabled ? "" : " · 来源已停用，仍保留"}`,
        sourceFieldId: field.id,
        ...(referenceTable
          ? { reference: { table: referenceTable, column: "_phone_record_id", multiple } }
          : {}),
      };
    });
    const rows = snapshot.records
      .filter((record) => record.tableId === table.id)
      .map((record) => {
        const values = fields.map((field): SqlValue => {
          const value = record.payload[field.id];
          if (value === null || value === undefined) return null;
          if (field.type === "single_reference" || field.type === "multi_reference") {
            const references = typeof value === "string" ? [value] : value;
            if (
              !Array.isArray(references) ||
              references.some((id) => recordsById.get(id)?.tableId !== field.referenceTableId)
            )
              throw new Error(`引用字段 ${table.key}.${field.key} 包含不存在或错误表的记录 ID`);
          }
          return Array.isArray(value)
            ? JSON.stringify(value)
            : typeof value === "boolean"
              ? Number(value)
              : (value as SqlValue);
        });
        return [
          "ste-memory",
          snapshot.space.id,
          record.id,
          record.createdAt,
          typeof record.updatedAt === "string" ? record.updatedAt : null,
          record.displayText,
          JSON.stringify(record.payload),
          JSON.stringify(record),
          profiles.get(record.id) ?? null,
          ...values,
        ];
      });
    objects.push({
      name,
      kind: "table",
      description: `${table.name} · 源表 key=${table.key} · ${table.enabled ? "启用" : "停用"}；完整公开字段与记录`,
      columns: [...sourceIdentity, ...columns],
      rows,
    });
  }
  if (
    snapshot.records.some((record) => !tableNames.has(record.tableId)) ||
    snapshot.fields.some((field) => !tableNames.has(field.tableId))
  )
    throw new Error("公开快照包含不存在表的字段或记录");

  const metadata = (
    name: string,
    description: string,
    columns: readonly DatabaseColumn[],
    rows: readonly (readonly SqlValue[])[],
  ) => objects.push({ name, kind: "table", description, columns, rows });
  metadata(
    "phone_source_space",
    "完整公开空间；数据库显示名与持久身份分离",
    [
      column("source_id", "来源身份"),
      column("scope_id", "空间身份"),
      column("name", "空间显示名称"),
      column("data_json", "完整公开空间 JSON"),
    ],
    [["ste-memory", snapshot.space.id, snapshot.space.name, JSON.stringify(snapshot.space)]],
  );
  metadata(
    "phone_source_tables",
    "来源表 ID、原始 key、SQL 表名与完整公开定义",
    [
      column("table_id", "来源表 ID"),
      column("source_key", "原始表 key"),
      column("sql_name", "导入表名"),
      column("data_json", "完整公开表 JSON"),
    ],
    snapshot.tables.map((table) => [
      table.id,
      table.key,
      tableNames.get(table.id)!,
      JSON.stringify(table),
    ]),
  );
  metadata(
    "phone_source_fields",
    "原始字段 ID/key、类型、引用目标与完整公开定义",
    [
      column("table_id", "来源表 ID"),
      column("field_id", "来源字段 ID"),
      column("source_key", "原始字段 key"),
      column("source_type", "原始类型"),
      column("reference_table_id", "引用目标表 ID"),
      column("data_json", "完整公开字段 JSON"),
    ],
    snapshot.fields.map((field) => [
      field.tableId,
      field.id,
      field.key,
      field.type,
      field.referenceTableId,
      JSON.stringify(field),
    ]),
  );
  const capabilities: SqlValue[][] = [];
  const idSelect =
    '"_phone_source_id" AS source_id,"_phone_scope_id" AS scope_id,"_phone_record_id" AS record_id';
  const optionalTypes: Readonly<Record<string, MemoryField["type"]>> = {
    personality: "long_text",
    background: "long_text",
    current_status: "long_text",
    start_time: "datetime",
    end_time: "datetime",
    related_characters: "multi_reference",
    owner: "single_reference",
    status: "long_text",
    current_location: "short_text",
    weather: "short_text",
    clothing: "short_text",
    other_scenes: "long_text",
  };
  function view(
    name: string,
    tableKey: string,
    required: Readonly<Record<string, MemoryField["type"]>>,
    fields: ReadonlyArray<readonly [string, string, string]>,
    description: string,
  ): boolean {
    const table = snapshot.tables.find((item) => item.key === tableKey && item.enabled);
    const sourceFields = table ? fieldsByTable.get(table.id)! : [];
    const missing = Object.entries(required).filter(
      ([key, type]) =>
        !sourceFields.some((field) => field.key === key && field.type === type && field.enabled),
    );
    const supported = !!table && missing.length === 0;
    const reason = !table
      ? `缺少启用的 ${tableKey} 表`
      : missing.length
        ? `字段缺失或类型不符：${missing.map(([key, type]) => `${key} (${type})`).join("、")}`
        : "来源结构支持；零行表示当前无记录";
    const available = (key: string): boolean => {
      if (key.startsWith("_phone_")) return true;
      const field = sourceFields.find((field) => field.key === key && field.enabled);
      if (!field || field.type !== (required[key] ?? optionalTypes[key])) return false;
      if (key === "owner" || key === "related_characters")
        return (
          field.referenceTableId === snapshot.tables.find((table) => table.key === "characters")?.id
        );
      return true;
    };
    const columns = [
      ...identity,
      ...fields.map(([name, key, description]) => ({
        ...column(
          name,
          `${description}${available(key) ? "" : " · 来源字段缺失、停用或类型/引用目标不兼容，返回 NULL"}`,
        ),
        ...(available(key) && (key === "owner" || key === "related_characters")
          ? {
              reference: {
                table: "phone_characters",
                column: "record_id",
                multiple: key === "related_characters",
              },
            }
          : {}),
      })),
    ];
    const expression = fields.map(
      ([name, key]) => `${available(key) ? q(key) : "CAST(NULL AS TEXT)"} AS ${q(name)}`,
    );
    objects.push({
      name,
      kind: "view",
      description: `${description}。${reason}`,
      columns,
      select: supported
        ? `SELECT ${idSelect},${expression.join(",")} FROM ${q(tableNames.get(table!.id)!)}`
        : `SELECT ${columns.map((item) => `CAST(NULL AS ${item.type}) AS ${q(item.name)}`).join(",")} WHERE 0`,
    });
    capabilities.push([name, supported ? "supported" : "unsupported", reason]);
    return supported;
  }
  const characters = view(
    "phone_characters",
    "characters",
    { name: "short_text" },
    [
      ["name", "name", "人物名称"],
      ["profile_text", "_phone_profile_text", "手机派生展示正文；映射失败为 NULL"],
      ["personality", "personality", "性格原文"],
      ["background", "background", "经历原文"],
      ["current_status", "current_status", "近况原文"],
    ],
    "人物标准视图；身份使用 source_id/scope_id/record_id",
  );
  const chronicles = view(
    "phone_chronicles",
    "chronicle",
    { summary: "short_text", details: "long_text" },
    [
      ["title", "summary", "纪要标题"],
      ["content", "details", "纪要原文"],
      ["start_time", "start_time", "来源剧情开始时间；缺失为 NULL"],
      ["end_time", "end_time", "来源剧情结束时间；缺失为 NULL"],
      ["related_character_ids", "related_characters", "人物 ID JSON 数组"],
      ["profile_text", "_phone_profile_text", "手机派生展示正文"],
    ],
    "纪要标准视图；创建时间不替代剧情时间",
  );
  view(
    "phone_items",
    "items",
    { name: "short_text", key_attributes: "long_text" },
    [
      ["name", "name", "物品名称"],
      ["description", "key_attributes", "属性原文"],
      ["owner_id", "owner", "持有者来源记录 ID"],
      ["status", "status", "当前状态"],
      ["profile_text", "_phone_profile_text", "手机派生展示正文"],
    ],
    "物品标准视图；owner_id 引用 phone_characters.record_id",
  );
  view(
    "phone_world_state",
    "story_state",
    { name: "short_text", current_time: "datetime" },
    [
      ["name", "name", "状态名称"],
      ["world_time", "current_time", "来源世界当前时间；不使用系统时间替代"],
      ["current_location", "current_location", "来源当前地点"],
      ["weather", "weather", "天气"],
      ["clothing", "clothing", "衣着"],
      ["other_scenes", "other_scenes", "其他场景原文"],
    ],
    "世界状态标准视图；当前日期可用 date(world_time) 查询",
  );
  const chronicle = snapshot.tables.find((table) => table.key === "chronicle");
  const character = snapshot.tables.find((table) => table.key === "characters");
  const relation =
    chronicle &&
    fieldsByTable
      .get(chronicle.id)!
      .find(
        (field) =>
          field.key === "related_characters" &&
          field.enabled &&
          field.type === "multi_reference" &&
          field.referenceTableId === character?.id,
      );
  const linked = !!(characters && chronicles && relation);
  objects.push({
    name: "phone_chronicle_characters",
    kind: "view",
    description: `纪要与人物的 ID 关联；${linked ? "通过 json_each 展开完整多值引用" : "unsupported：需要可用的人物、纪要及 related_characters 多引用字段"}`,
    columns: [
      column("source_id", "来源身份"),
      column("scope_id", "空间身份"),
      column("chronicle_id", "引用 phone_chronicles.record_id"),
      column("character_id", "引用 phone_characters.record_id"),
    ],
    select: linked
      ? "SELECT c.source_id,c.scope_id,c.record_id AS chronicle_id,CAST(j.value AS TEXT) AS character_id FROM phone_chronicles c,json_each(c.related_character_ids) j"
      : "SELECT CAST(NULL AS TEXT) AS source_id,CAST(NULL AS TEXT) AS scope_id,CAST(NULL AS TEXT) AS chronicle_id,CAST(NULL AS TEXT) AS character_id WHERE 0",
  });
  capabilities.push([
    "phone_chronicle_characters",
    linked ? "supported" : "unsupported",
    linked ? "完整 ID 关联" : "缺少可用的纪要人物多引用映射",
  ]);
  capabilities.push([
    "background_display",
    background.backgroundError ? "error" : "supported",
    background.backgroundError ?? "资料 App 展示映射可用",
  ]);
  metadata(
    "phone_capabilities",
    "标准映射能力；unsupported 空视图与 supported 零记录分开标示",
    [
      column("object_name", "标准对象名"),
      column("status", "supported / unsupported / error"),
      column("detail", "具体原因"),
    ],
    capabilities,
  );
  return {
    sourceId: "ste-memory",
    scopeId: snapshot.space.id,
    name: snapshot.space.name,
    schemaVersion: 1,
    objects,
  };
}
