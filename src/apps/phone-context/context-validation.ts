import type { PhoneContextData, PhoneContextPreset } from "./public.ts";

export function validateContextPreset(value: unknown): asserts value is PhoneContextPreset {
  if (!value || typeof value !== "object") {
    throw new Error("ST 宏绑定格式无效");
  }
  const preset = value as PhoneContextPreset;
  if (typeof preset.id !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(preset.id)) {
    throw new Error("宏标识须以小写字母开头，仅含小写字母、数字、下划线或连字符，最长 64 位");
  }
  if (
    typeof preset.name !== "string" ||
    !preset.name.trim() ||
    typeof preset.sourceId !== "string" ||
    !preset.sourceId
  ) {
    throw new Error("绑定名称和应用不能为空");
  }
  if (typeof preset.intentId !== "string" || !preset.intentId) {
    throw new Error("请选择 App Intent");
  }
}

export function validateContextData(value: unknown): asserts value is PhoneContextData {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 2 ||
    !("presets" in value) ||
    !Array.isArray(value.presets)
  ) {
    throw new Error("ST 宏绑定存储格式无效");
  }
  const ids = new Set<string>();
  for (const preset of value.presets) {
    validateContextPreset(preset);
    if (ids.has(preset.id)) {
      throw new Error("ST 宏标识重复");
    }
    ids.add(preset.id);
  }
}
