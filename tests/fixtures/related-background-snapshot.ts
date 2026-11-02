import { memorySnapshotFixture } from "./memory-snapshot.ts";
import type {
  MemorySnapshot,
  MemoryRecord,
} from "../../src/infrastructure/ste-memory/public-read-contract.ts";

/** 关联取材与预览共用的样例；基础fixture记录数保持原样。 */
export function relatedBackgroundSnapshot(cloned = false): MemorySnapshot {
  const base = memorySnapshotFixture();
  const record = (id: string, table: string, values: MemoryRecord["payload"]): MemoryRecord => ({
    ...base.records[0]!,
    id,
    stableId: id,
    tableId: `table-${table}`,
    displayText: String(values.name ?? values.summary ?? id),
    payload: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [`${table}.${key}`, value]),
    ),
  });
  const records = [
    ...base.records,
    record("far", "characters", {
      name: "远方同学",
      personality: "开朗",
      background: "仅与另一班同学认识",
      current_status: "无关近况",
    }),
    record("red-blue", "relationships", {
      character_a: "red",
      character_b: "blue",
      summary: "小红信任小蓝；小蓝仍有顾虑",
      key_facts: "小蓝答应帮忙校对",
    }),
    record("third-red", "relationships", {
      character_a: "another-red",
      character_b: "red",
      summary: "同名同学向小红借过书",
      key_facts: "归还日期尚未确定，远方同学只被口头提及",
    }),
    record("third-far", "relationships", {
      character_a: "another-red",
      character_b: "far",
      summary: "不应递归扩展的关系",
      key_facts: "远方关系事实",
    }),
    record("red-bag", "items", {
      name: "帆布袋",
      owner: "red",
      key_attributes: "文学社公用袋，所有权属于社团",
      status: "暂由小红保管",
    }),
    record("far-pen", "items", {
      name: "无关钢笔",
      owner: "far",
      key_attributes: "不应取到",
      status: "完好",
    }),
    record("no-holder", "items", {
      name: "无人持有的钥匙",
      owner: null,
      key_attributes: "最后见于走廊",
      status: "持有者未知",
    }),
    record("reading", "important_events", {
      name: "朗读会",
      details: "周五在文学社活动室举行",
      start_time: "2026-11-06 16:00:00",
      end_time: null,
      related_characters: ["blue", "another-red", "another-red"],
      outcome: "活动已宣布延期，日期待定",
    }),
    record("past-event", "important_events", {
      name: "上次校刊评选",
      details: "上学期的评选",
      start_time: "2026-06-01 10:00:00",
      end_time: "2026-06-01 12:00:00",
      related_characters: ["red"],
      outcome: "已经结束，小红获奖",
    }),
    record("far-event", "important_events", {
      name: "无关比赛",
      details: "第三人的其他安排",
      related_characters: ["another-red", "far"],
      outcome: "不应递归取到",
    }),
  ];
  if (!cloned) {
    return { ...base, records };
  }
  const referenceFields = new Set(
    base.fields
      .filter((field) => ["single_reference", "multi_reference"].includes(field.type))
      .map((field) => field.id),
  );
  const instanceIds = new Map(records.map((item) => [item.id, `instance-${item.id}`]));
  return {
    ...base,
    space: { ...base.space, id: "cloned-space" },
    records: records.map((item) => ({
      ...item,
      id: instanceIds.get(item.id)!,
      memorySpaceId: "cloned-space",
      payload: Object.fromEntries(
        Object.entries(item.payload).map(([key, value]) => {
          if (!referenceFields.has(key) || value === null) {
            return [key, value];
          }
          return [
            key,
            Array.isArray(value)
              ? value.map((id) => instanceIds.get(id)!)
              : instanceIds.get(value as string)!,
          ];
        }),
      ),
    })),
  };
}
