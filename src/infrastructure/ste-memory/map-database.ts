import type {
  DatabaseColumn,
  DatabaseObject,
  DatabaseSchema,
} from "../../apps/data-source/database.ts";
import { identifierKey, quoteIdentifier as q } from "../../apps/data-source/database.ts";
import type {
  MemoryDatabaseDescription,
  MemoryField,
  MemoryTable,
} from "./public-read-contract.ts";

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const column = (
  name: string,
  description: string,
  type: DatabaseColumn["type"] = "TEXT",
): DatabaseColumn => ({ name, description, type });
const identity = [
  column("source_id", "来源持久身份"),
  column("scope_id", "当前实例空间身份；用于查询归属"),
  column("stable_scope_id", "稳定空间身份；用于持久引用"),
  column("record_id", "当前实例记录 ID；用于关系 JOIN"),
  column("stable_record_id", "稳定记录身份；用于持久引用"),
  column("created_at", "记录创建时间；不代表剧情时间"),
];

/** 从公开结构生成 SELECT；所有业务值由 Memory committed 数据库在执行时读取。 */
export function mapMemoryDatabase(schema: MemoryDatabaseDescription): DatabaseSchema {
  const objects: DatabaseObject[] = [];
  const names = new Set(schema.tables.map((table) => identifierKey(table.key)));
  const fieldsFor = (table: MemoryTable) =>
    schema.fields
      .filter((field) => field.tableId === table.id && field.enabled)
      .toSorted((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  function add(object: DatabaseObject): void {
    const key = identifierKey(object.name);
    if (names.has(key)) {
      throw new Error(`查询对象名碰撞：${object.name}`);
    }
    names.add(key);
    objects.push(object);
  }
  const idSelect = `${literal("ste-memory")} AS source_id,${literal(schema.space.id)} AS scope_id,${literal(schema.space.stableId)} AS stable_scope_id,r."$record_id" AS record_id,r."$stable_id" AS stable_record_id,r."$created_at" AS created_at`;
  for (const table of schema.tables) {
    const fields = fieldsFor(table);
    if (!schema.columns[table.key]!.includes("$stable_id")) {
      throw new Error(`Memory 公开表缺少 $stable_id，请升级 Memory：${table.key}`);
    }
    const columns = fields.map((field): DatabaseColumn => {
      if (!schema.columns[table.key]!.includes(field.key)) {
        throw new Error(`公开结构缺少列：${table.key}.${field.key}`);
      }
      if (identifierKey(field.key).startsWith("_phone_")) {
        throw new Error(`源列使用了保留前缀：${table.key}.${field.key}`);
      }
      const multiple = ["multi_reference", "multi_select", "short_text_list"].includes(field.type);
      const target =
        field.referenceTableId === null
          ? undefined
          : schema.tables.find((item) => item.id === field.referenceTableId);
      return {
        name: field.key,
        type: ["integer", "boolean"].includes(field.type)
          ? "INTEGER"
          : field.type === "decimal"
            ? "REAL"
            : "TEXT",
        description: `${field.name} · ${field.type}${multiple ? " · JSON 数组，可用 json_each 展开" : ""}${field.referenceTableId && !target ? " · 引用目标表未公开或不可用，保留原始 ID" : ""}`,
        sourceFieldId: field.id,
        ...(target
          ? { reference: { table: `src_${target.key}`, column: "_phone_record_id", multiple } }
          : {}),
      };
    });
    add({
      name: `src_${table.key}`,
      kind: "view",
      description: `${table.name} · Memory 公开业务表 ${table.key} 的别名；仅启用字段`,
      columns: [
        column("_phone_source_id", "来源身份"),
        column("_phone_scope_id", "当前实例空间身份"),
        column("_phone_stable_scope_id", "稳定空间身份"),
        column("_phone_record_id", "当前实例记录 ID"),
        column("_phone_stable_record_id", "稳定记录身份"),
        column("_phone_created_at", "创建时间"),
        column("_phone_updated_at", "更新时间"),
        column("_phone_display_text", "来源显示文本"),
        ...columns,
      ],
      select: `SELECT ${literal("ste-memory")} AS _phone_source_id,${literal(schema.space.id)} AS _phone_scope_id,${literal(schema.space.stableId)} AS _phone_stable_scope_id,"$record_id" AS _phone_record_id,"$stable_id" AS _phone_stable_record_id,"$created_at" AS _phone_created_at,"$updated_at" AS _phone_updated_at,"$display_text" AS _phone_display_text${fields.map((field) => `,${q(field.key)}`).join("")} FROM ${q(table.key)}`,
    });
  }

  let alias = 0;
  function renderName(table: MemoryTable, row: string, visited: readonly string[]): string {
    if (visited.includes(table.id)) {
      throw new Error(`显示策略存在循环引用：${table.name}`);
    }
    const strategy = table.displayStrategy;
    if (!strategy) {
      return `${row}."$display_text"`;
    }
    const next = [...visited, table.id];
    const fields = fieldsFor(table);
    const render = (id: string): string => {
      const field = fields.find((item) => item.id === id);
      if (!field) {
        throw new Error(`显示策略引用了不可用字段：${table.name}.${id}`);
      }
      return renderValue(field, row, next);
    };
    if (strategy.type === "field") {
      return render(strategy.fieldId);
    }
    const parts: string[] = [];
    let position = 0;
    for (const match of strategy.template.matchAll(/\{([^{}]+)\}/g)) {
      parts.push(
        literal(strategy.template.slice(position, match.index)),
        `coalesce(${render(match[1]!)},'')`,
      );
      position = match.index + match[0].length;
    }
    parts.push(literal(strategy.template.slice(position)));
    return parts.join("||");
  }
  function renderValue(field: MemoryField, row: string, visited: readonly string[]): string {
    const value = `${row}.${q(field.key)}`;
    if (field.type === "single_reference" || field.type === "multi_reference") {
      const table = schema.tables.find((item) => item.id === field.referenceTableId);
      if (!table) {
        throw new Error(`引用目标表不可用：${field.name}`);
      }
      const target = `ref${++alias}`;
      const name = renderName(table, target, visited);
      if (field.type === "single_reference") {
        return `(SELECT ${name} FROM ${q(table.key)} ${target} WHERE ${target}."$record_id"=${value})`;
      }
      const json = `list${++alias}`;
      return `(SELECT group_concat(display_name,'、') FROM (SELECT ${name} AS display_name FROM json_each(${value}) ${json} JOIN ${q(table.key)} ${target} ON ${target}."$record_id"=${json}.value ORDER BY ${json}.key))`;
    }
    if (["short_text_list", "multi_select"].includes(field.type)) {
      return `(SELECT group_concat(value,'、') FROM json_each(${value}))`;
    }
    if (field.type === "boolean") {
      return `CASE ${value} WHEN 1 THEN '是' WHEN 0 THEN '否' END`;
    }
    return `CAST(${value} AS TEXT)`;
  }
  function profile(table: MemoryTable): string {
    const parts = fieldsFor(table).map((field) => {
      const value = renderValue(field, "r", []);
      return `CASE WHEN ${value} IS NULL OR ${value}='' THEN '' ELSE ${literal(field.name + "：")}||${value}||char(10) END`;
    });
    return `rtrim(${parts.join("||")},char(10))`;
  }
  const capabilities: string[][] = [];
  function standard(
    name: string,
    tableKey: string,
    definitions: readonly (readonly [string, string, MemoryField["type"]])[],
    withProfile = true,
  ): void {
    try {
      const table = schema.tables.find((table) => table.key === tableKey);
      if (!table) {
        throw new Error(`缺少启用的 ${tableKey} 表`);
      }
      const fields = fieldsFor(table);
      const columns = definitions.map(([name, key, type]) => {
        const field = fields.find((field) => field.key === key && field.type === type);
        if (!field) {
          throw new Error(`字段缺失或类型不符：${tableKey}.${key}（需要 ${type}）`);
        }
        if (
          (key === "owner" || key === "related_characters") &&
          field.referenceTableId !== schema.tables.find((table) => table.key === "characters")?.id
        ) {
          throw new Error(`引用目标不兼容：${tableKey}.${key}`);
        }
        return {
          ...column(name, field.name),
          ...(key === "owner" || key === "related_characters"
            ? {
                reference: {
                  table: "phone_characters",
                  column: "record_id",
                  multiple: key === "related_characters",
                },
              }
            : {}),
        };
      });
      const text = withProfile ? profile(table) : null;
      add({
        name,
        kind: "view",
        description: `手机标准视图 · ${table.name} · Memory 直连`,
        columns: [
          ...identity,
          ...columns,
          ...(withProfile
            ? [column("profile_text", "按启用字段与标签拼接，引用使用当前显示策略")]
            : []),
        ],
        select: `SELECT ${idSelect},${definitions.map(([name, key]) => `r.${q(key)} AS ${q(name)}`).join(",")}${text === null ? "" : `,${text} AS profile_text`} FROM ${q(table.key)} r`,
      });
      capabilities.push([name, "supported", "来源结构支持；零行表示当前没有记录"]);
    } catch (error) {
      capabilities.push([
        name,
        "unsupported",
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }
  standard("phone_characters", "characters", [
    ["name", "name", "short_text"],
    ["personality", "personality", "long_text"],
    ["background", "background", "long_text"],
    ["current_status", "current_status", "long_text"],
  ]);
  standard("phone_chronicles", "chronicle", [
    ["title", "summary", "short_text"],
    ["content", "details", "long_text"],
    ["start_time", "start_time", "datetime"],
    ["end_time", "end_time", "datetime"],
    ["related_character_ids", "related_characters", "multi_reference"],
  ]);
  standard("phone_items", "items", [
    ["name", "name", "short_text"],
    ["description", "key_attributes", "long_text"],
    ["owner_id", "owner", "single_reference"],
    ["status", "status", "long_text"],
  ]);
  standard(
    "phone_world_state",
    "story_state",
    [
      ["name", "name", "short_text"],
      ["world_time", "current_time", "datetime"],
      ["current_location", "current_location", "short_text"],
      ["weather", "weather", "short_text"],
      ["clothing", "clothing", "short_text"],
      ["other_scenes", "other_scenes", "long_text"],
    ],
    false,
  );
  if (
    ["phone_characters", "phone_chronicles"].every((name) =>
      objects.some((object) => object.name === name),
    )
  ) {
    // 悬空引用仍保留实例关系行；只有存在的目标人物才能提供稳定身份。
    add({
      name: "phone_chronicle_characters",
      kind: "view",
      description: "纪要与人物的 ID 关联，完整展开 JSON 多值引用",
      columns: [
        column("source_id", "来源身份"),
        column("scope_id", "当前实例空间身份"),
        column("stable_scope_id", "稳定空间身份"),
        column("chronicle_id", "纪要 ID"),
        column("character_id", "当前实例人物 ID"),
        column("stable_chronicle_id", "稳定纪要身份"),
        column("stable_character_id", "稳定人物身份"),
      ],
      select:
        "SELECT c.source_id,c.scope_id,c.stable_scope_id,c.record_id AS chronicle_id,CAST(j.value AS TEXT) AS character_id,c.stable_record_id AS stable_chronicle_id,p.stable_record_id AS stable_character_id FROM phone_chronicles c,json_each(c.related_character_ids) j LEFT JOIN phone_characters p ON p.record_id=CAST(j.value AS TEXT)",
    });
    capabilities.push(["phone_chronicle_characters", "supported", "完整多值 ID 关联"]);
  } else {
    capabilities.push(["phone_chronicle_characters", "unsupported", "需要可用的人物与纪要映射"]);
  }
  const backgroundErrors = capabilities.filter(
    ([name, status]) =>
      ["phone_characters", "phone_chronicles", "phone_items"].includes(name!) &&
      status !== "supported",
  );
  capabilities.push([
    "background_display",
    backgroundErrors.length ? "unsupported" : "supported",
    backgroundErrors.length ? backgroundErrors.map((row) => row[2]).join("；") : "资料展示映射可用",
  ]);
  add({
    name: "phone_capabilities",
    kind: "view",
    description: "标准映射能力；不支持的标准视图不注册，查询前可检查具体原因",
    columns: [
      column("object_name", "对象名"),
      column("status", "supported / unsupported"),
      column("detail", "具体原因"),
    ],
    select: capabilities
      .map(
        (row) =>
          `SELECT ${literal(row[0]!)} AS object_name,${literal(row[1]!)} AS status,${literal(row[2]!)} AS detail`,
      )
      .join(" UNION ALL "),
  });
  return {
    sourceId: "ste-memory",
    scopeId: schema.space.id,
    stableScopeId: schema.space.stableId,
    name: schema.space.name,
    schemaVersion: 1,
    schemaKey: schema.schemaKey,
    databaseKey: schema.databaseKey,
    objects,
  };
}
