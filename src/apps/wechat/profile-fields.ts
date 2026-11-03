export interface ProfileField {
  readonly label: string;
  readonly value: string;
}

// 人物简介由 Memory 映射按“字段名：值”逐行拼成，这里拆回字段供页面分组展示。
const FIELD_START = /^([^：:\n]{1,24})[：:](.*)$/;

export function readProfileFields(profileText: string): ProfileField[] {
  const fields: ProfileField[] = [];
  for (const line of profileText.split(/\r?\n/)) {
    const match = FIELD_START.exec(line);
    if (match) {
      fields.push({ label: match[1]!, value: match[2]! });
      continue;
    }
    const current = fields.at(-1);
    if (current) {
      fields[fields.length - 1] = { label: current.label, value: `${current.value}\n${line}` };
    } else if (line.trim()) {
      fields.push({ label: "简介", value: line });
    }
  }
  return fields.filter((field) => field.value.trim() !== "");
}

// 选择人物时只露一行可读简介。Memory 资料按字段名逐行提供，优先取性格与近况，
// 避免把 name、background 等原始键名整段塞进列表。
const SUMMARY_LABELS = [
  "personality",
  "性格",
  "current_status",
  "current status",
  "近况",
  "当前状态",
  "background",
  "背景",
  "简介",
];
const NAME_LABELS = new Set(["name", "姓名"]);

export function readProfileSummary(profileText: string): string {
  const fields = readProfileFields(profileText);
  const preferred = SUMMARY_LABELS.map((label) =>
    fields.find((field) => field.label.toLowerCase() === label),
  ).find((field): field is ProfileField => field !== undefined);
  const fallback = fields.find((field) => !NAME_LABELS.has(field.label.toLowerCase()));
  return (preferred ?? fallback)?.value.trim() ?? profileText.trim();
}
