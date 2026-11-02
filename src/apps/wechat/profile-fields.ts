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
