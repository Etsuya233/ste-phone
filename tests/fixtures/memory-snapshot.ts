import type {
  MemoryField,
  MemorySnapshot,
} from "../../src/infrastructure/ste-memory/public-read-contract.ts";

/** 完整公开 v1 快照；独立预览和真实 WASM 测试共用，生产入口不引用。 */
export function memorySnapshotFixture(empty = false): MemorySnapshot {
  const timestamp = "2026-10-30T08:00:00.000Z";
  const definitions = {
    characters: {
      name: "short_text",
      aliases: "short_text_list",
      personality: "long_text",
      background: "long_text",
      current_status: "long_text",
    },
    chronicle: {
      summary: "short_text",
      details: "long_text",
      start_time: "datetime",
      end_time: "datetime",
      related_characters: "multi_reference",
    },
    items: {
      name: "short_text",
      key_attributes: "long_text",
      owner: "single_reference",
      status: "long_text",
    },
    story_state: {
      name: "short_text",
      current_time: "datetime",
      current_location: "short_text",
      weather: "short_text",
      clothing: "short_text",
      other_scenes: "long_text",
    },
    custom_notes: {
      title: "short_text",
      score: "decimal",
      count: "integer",
      active: "boolean",
      tags: "multi_select",
      day: "date",
      archived: "long_text",
    },
  } as const;
  const names: Record<string, string> = {
    characters: "人物",
    chronicle: "纪要",
    items: "物品",
    story_state: "世界状态",
    custom_notes: "自定义研究笔记",
  };
  const tables = Object.keys(definitions).map((key, position) => ({
    id: `table-${key}`,
    memorySpaceId: "preview-space",
    key,
    name: names[key]!,
    description: `${names[key]}完整来源表`,
    prompt: "",
    enabled: true,
    position,
    displayStrategy: {
      type: "field" as const,
      fieldId: `${key}.${key === "chronicle" ? "summary" : key === "custom_notes" ? "title" : "name"}`,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const fields = Object.entries(definitions).flatMap(([table, fields]) =>
    Object.entries(fields).map(([key, type], position): MemoryField => ({
      id: `${table}.${key}`,
      memorySpaceId: "preview-space",
      tableId: `table-${table}`,
      key,
      name: key,
      type,
      required: false,
      prompt: "",
      enabled: key !== "archived",
      position,
      options: type === "multi_select" ? ["线索", "校园"] : [],
      referenceTableId:
        type === "single_reference" || type === "multi_reference" ? "table-characters" : null,
      maxChars: null,
      valuePattern: null,
      valuePatternMessage: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })),
  );
  function record(
    id: string,
    table: keyof typeof definitions,
    values: Record<string, string | number | boolean | null | readonly string[]>,
  ) {
    return {
      id,
      memorySpaceId: "preview-space",
      tableId: `table-${table}`,
      payload: Object.fromEntries(
        Object.entries(values).map(([key, value]) => [`${table}.${key}`, value]),
      ),
      fieldEvidence: {},
      displayText: String(values.name ?? values.summary ?? values.title),
      source: { type: "manual" },
      revisionId: `revision-${id}`,
      revisionSource: "user",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
  return {
    space: { id: "preview-space", name: "示例剧情", createdAt: timestamp, updatedAt: timestamp },
    tables,
    fields,
    records: empty
      ? []
      : [
          record("red", "characters", {
            name: "小红",
            aliases: ["文学社小红"],
            personality: "直率，习惯把细小的事情记在本子上。",
            background: "高二学生、文学社成员，上学期与小蓝一起负责校刊。",
            current_status: "正在准备周五的朗读会。",
          }),
          record("blue", "characters", {
            name: "小蓝",
            personality: "安静，做事认真。",
            background: "高二学生",
            current_status: "答应帮助小红校对稿件，明天带来最后一版。",
          }),
          record("another-red", "characters", {
            name: "小红",
            background: "另一班的同名同学",
            current_status: "今天没有参与文学社活动。",
          }),
          record("event-1", "chronicle", {
            summary: "图书馆里的约定",
            details: "放学后，小红与小蓝在图书馆讨论朗读会的稿件。",
            start_time: "2026-10-30 16:30:00",
            end_time: null,
            related_characters: ["red", "blue"],
          }),
          record("event-2", "chronicle", {
            summary: "借出的笔记本",
            details: "小红将自己的笔记本借给小蓝，明天归还。",
            related_characters: ["red", "blue"],
          }),
          record("notebook", "items", {
            name: "蓝色笔记本",
            key_attributes: "封面贴着星星贴纸，用来整理引文。",
            owner: "blue",
            status: "借给小蓝用于校对。",
          }),
          record("world", "story_state", {
            name: "放学之后",
            current_time: "2026-10-30 16:45:00",
            current_location: "学校图书馆",
            weather: "晴",
            clothing: "秋季校服",
            other_scenes: "朗读会将在周五举行。",
          }),
          record("note-1", "custom_notes", {
            title: "朗读会准备",
            score: 9.5,
            count: 2,
            active: true,
            tags: ["线索", "校园"],
            day: "2026-10-30",
            archived: "停用字段仍保留",
          }),
        ],
  };
}
