export interface WechatIntentSelection {
  readonly scopeId: string;
  readonly personIds: readonly string[];
  /** 旧方案未保存群 ID，只按人物读取单聊。 */
  readonly groupIds?: readonly string[];
  readonly recentMinutes: number | null;
  readonly limitPerGroup: number;
}

export interface WechatIntentScope {
  readonly id: string;
  readonly label: string;
  readonly people: readonly { readonly id: string; readonly name: string }[];
  readonly groups: readonly { readonly id: string; readonly name: string }[];
}

export interface WechatIntentResult {
  readonly text: string;
  readonly itemCount: number;
  readonly groupCount: number;
  readonly excluded: { readonly barrier: number; readonly time: number; readonly limit: number };
}

export interface WechatIntent {
  readonly id: string;
  readonly name: string;
  readonly selection: WechatIntentSelection;
}

export interface WechatIntentData {
  readonly version: 1;
  readonly intents: readonly WechatIntent[];
}

export interface WechatIntentSnapshot {
  readonly chatId: string | null;
  readonly intents: readonly WechatIntent[];
  readonly saving: boolean;
  readonly error: string | null;
}

export function validateWechatIntent(value: unknown): asserts value is WechatIntent {
  if (!value || typeof value !== "object") {
    throw new Error("微信 App Intent 格式无效");
  }
  const intent = value as WechatIntent;
  if (
    typeof intent.id !== "string" ||
    !intent.id ||
    typeof intent.name !== "string" ||
    !intent.name.trim()
  ) {
    throw new Error("微信 App Intent 标识和名称不能为空");
  }
  validateWechatIntentSelection(intent.selection);
}

export function validateWechatIntentSelection(selection: WechatIntentSelection): void {
  if (!selection || typeof selection.scopeId !== "string" || !selection.scopeId) {
    throw new Error("请选择资料空间");
  }
  if (
    !Array.isArray(selection.personIds) ||
    selection.personIds.some((id) => typeof id !== "string" || !id) ||
    new Set(selection.personIds).size !== selection.personIds.length
  ) {
    throw new Error("微信 App Intent 人物选择无效或重复");
  }
  const { groupIds } = selection;
  if (
    groupIds !== undefined &&
    (!Array.isArray(groupIds) ||
      groupIds.some((id) => typeof id !== "string" || !id) ||
      new Set(groupIds).size !== groupIds.length)
  ) {
    throw new Error("微信 App Intent 群聊选择无效或重复");
  }
  if (selection.personIds.length < 2 && !groupIds?.length) {
    throw new Error("微信 App Intent 须选择至少两位人物或一个群聊");
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

export function validateWechatIntentData(value: unknown): asserts value is WechatIntentData {
  if (
    !value ||
    typeof value !== "object" ||
    !("version" in value) ||
    value.version !== 1 ||
    !("intents" in value) ||
    !Array.isArray(value.intents)
  ) {
    throw new Error("微信 App Intent 存储格式无效");
  }
  const ids = new Set<string>();
  for (const intent of value.intents) {
    validateWechatIntent(intent);
    if (ids.has(intent.id)) {
      throw new Error("微信 App Intent 标识重复");
    }
    ids.add(intent.id);
  }
}
