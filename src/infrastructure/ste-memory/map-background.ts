import type { PhoneBackground } from "../../features/background/index.ts";
import type { MemoryField, MemoryRecord, MemorySnapshot } from "./public-read-contract.ts";

/**
 * 将「剧情记忆」预设明确映射为手机资料。缺表、缺字段或类型不符时整份读取失败。
 * 文本直接保留启用字段及其标签，不调用模型摘要，也不依赖记录显示名称作为身份。
 */
export function mapMemoryBackground(snapshot: MemorySnapshot): PhoneBackground {
  const recordsById = new Map(snapshot.records.map((record) => [record.id, record]));
  const fieldsByTable = new Map(
    snapshot.tables.map((table) => [
      table.id,
      snapshot.fields
        .filter((field) => field.tableId === table.id)
        .toSorted((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    ]),
  );
  const tablesById = new Map(snapshot.tables.map((table) => [table.id, table]));

  function renderFieldValue(
    record: MemoryRecord,
    field: MemoryField,
    visited: ReadonlySet<string>,
  ): string {
    const value = record.payload[field.id];
    if (value === null || value === undefined) return "";
    if (field.type === "single_reference" || field.type === "multi_reference") {
      const ids = typeof value === "string" ? [value] : value;
      if (!Array.isArray(ids)) throw new Error(`引用字段「${field.name}」的值类型不正确`);
      return ids
        .map((id: string) => {
          const target = recordsById.get(id);
          if (!target || target.tableId !== field.referenceTableId)
            throw new Error(`引用字段「${field.name}」指向不存在的人物或记录：${id}`);
          return renderRecordName(target, visited);
        })
        .join("、");
    }
    if (Array.isArray(value)) return value.join("、");
    if (typeof value === "boolean") return value ? "是" : "否";
    return String(value);
  }

  // 从同一份快照重算引用名称，人物改名后不会继续使用引用记录里保存的旧显示文本。
  function renderRecordName(record: MemoryRecord, visited: ReadonlySet<string>): string {
    if (visited.has(record.id)) throw new Error("Memory 显示策略存在循环引用，请修正资料结构");
    const next = new Set(visited).add(record.id);
    const table = tablesById.get(record.tableId)!;
    const fields = fieldsByTable.get(record.tableId)!;
    const strategy = table.displayStrategy;
    if (!strategy) return record.displayText;
    if (strategy.type === "field") {
      const field = fields.find((item) => item.id === strategy.fieldId);
      if (!field) throw new Error(`「${table.name}」的显示字段已不存在`);
      return renderFieldValue(record, field, next);
    }
    return strategy.template.replace(/\{([^{}]+)\}/g, (_match, id: string) => {
      const field = fields.find((item) => item.id === id);
      if (!field) throw new Error(`「${table.name}」的显示模板引用了不存在的字段`);
      return renderFieldValue(record, field, next);
    });
  }

  function readTableEntries(
    key: string,
    nameFieldKey: string,
    requiredFields: Readonly<Record<string, MemoryField["type"]>>,
  ) {
    const table = snapshot.tables.find((item) => item.key === key);
    if (!table || !table.enabled)
      throw new Error(`缺少启用的「${key}」表，请在 Memory 中使用或更新「剧情记忆」预设`);
    const fields = fieldsByTable.get(table.id)!;
    for (const [fieldKey, type] of Object.entries(requiredFields)) {
      const field = fields.find((item) => item.key === fieldKey);
      if (!field || !field.enabled || field.type !== type)
        throw new Error(`「${table.name}」缺少启用的 ${fieldKey} 字段或类型不符（需要 ${type}）`);
    }
    const nameField = fields.find((field) => field.key === nameFieldKey)!;
    return snapshot.records
      .filter((record) => record.tableId === table.id)
      .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map((record) => {
        const name = record.payload[nameField.id];
        if (typeof name !== "string" || !name.trim())
          throw new Error(`「${table.name}」记录 ${record.id} 缺少名称`);
        const text = fields
          .filter((field) => field.enabled)
          .flatMap((field) => {
            const value = renderFieldValue(record, field, new Set());
            return value === "" ? [] : [`${field.name}：${value}`];
          })
          .join("\n");
        return { id: record.id, name, text };
      });
  }

  // 表 Key、名称字段和内容要求集中在此，App 与通用读取流程无需了解 Memory 表结构。
  const characters = readTableEntries("characters", "name", {
    name: "short_text",
    personality: "long_text",
    background: "long_text",
    current_status: "long_text",
  });
  const chronicles = readTableEntries("chronicle", "summary", {
    summary: "short_text",
    details: "long_text",
  });
  const items = readTableEntries("items", "name", {
    name: "short_text",
    key_attributes: "long_text",
  });
  return {
    sourceId: "ste-memory",
    scopeId: snapshot.space.id,
    characters: characters.map(({ id, name, text }) => ({ id, name, profileText: text })),
    chronicles: chronicles.map(({ id, name, text }) => ({ id, title: name, content: text })),
    items: items.map(({ id, name, text }) => ({ id, name, description: text })),
  };
}
