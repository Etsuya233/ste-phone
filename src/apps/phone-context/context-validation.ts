import type { PhoneContextData, PhoneContextPreset } from "./public.ts";

export function validateContextPreset(value: unknown): asserts value is PhoneContextPreset {
  if (!value || typeof value !== "object") {
    throw new Error("手机上下文预设格式无效");
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
    throw new Error("预设名称和内容来源不能为空");
  }
  const selection = preset.selection;
  if (!selection || typeof selection.scopeId !== "string" || !selection.scopeId) {
    throw new Error("请选择资料空间");
  }
  if (
    !Array.isArray(selection.personIds) ||
    selection.personIds.some((id) => typeof id !== "string" || !id) ||
    new Set(selection.personIds).size !== selection.personIds.length
  ) {
    throw new Error("人物选择格式无效或包含重复人物");
  }
  if (
    selection.recentMinutes !== null &&
    (!Number.isSafeInteger(selection.recentMinutes) || selection.recentMinutes <= 0)
  ) {
    throw new Error("最近分钟数须为正安全整数，或选择不限时间");
  }
  if (!Number.isSafeInteger(selection.limitPerGroup) || selection.limitPerGroup <= 0) {
    throw new Error("每个会话消息条数须为正安全整数");
  }
}

export function validateContextData(value: unknown): asserts value is PhoneContextData {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("presets" in value) ||
    !Array.isArray(value.presets)
  ) {
    throw new Error("手机上下文存储格式无效");
  }
  const ids = new Set<string>();
  for (const preset of value.presets) {
    validateContextPreset(preset);
    if (ids.has(preset.id)) {
      throw new Error("手机上下文宏标识重复");
    }
    ids.add(preset.id);
  }
}
