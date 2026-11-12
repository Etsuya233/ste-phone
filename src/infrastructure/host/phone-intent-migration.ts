import type { PhoneContextData } from "../../apps/phone-context/public.ts";
import { validateContextData } from "../../apps/phone-context/context-validation.ts";
import type { WechatIntentData, WechatIntent } from "../../apps/wechat/public.ts";
import { validateWechatIntentData } from "../../apps/wechat/public.ts";

export interface PhoneIntentBlocks {
  readonly contextPresets: PhoneContextData;
  readonly wechatIntents: WechatIntentData;
}

/** 旧版把微信条件存在宏预设中。只投影，不写回；首次显式保存一起提交两个新块。 */
export function readPhoneIntentBlocks(context: unknown, intents: unknown): PhoneIntentBlocks {
  if (
    context !== undefined &&
    context !== null &&
    typeof context === "object" &&
    "version" in context &&
    context.version === 1
  ) {
    if (intents !== undefined) {
      throw new Error("旧版宏预设与微信 App Intent 同时存在，无法确定迁移归属");
    }
    return migrateLegacyContext(context);
  }
  const contextPresets = context === undefined ? { version: 2, presets: [] } : context;
  const wechatIntents = intents === undefined ? { version: 1, intents: [] } : intents;
  validateContextData(contextPresets);
  validateWechatIntentData(wechatIntents);
  return structuredClone({ contextPresets, wechatIntents });
}

function migrateLegacyContext(value: object): PhoneIntentBlocks {
  if (!("presets" in value) || !Array.isArray(value.presets)) {
    throw new Error("旧版手机上下文存储格式无效");
  }
  const intents: WechatIntent[] = [];
  const presets: PhoneContextData["presets"][number][] = [];
  for (const item of value.presets) {
    if (!item || typeof item !== "object" || item.sourceId !== "wechat") {
      throw new Error("旧版手机上下文来源无效，仅支持迁移微信预设");
    }
    intents.push({ id: item.id, name: item.name, selection: item.selection });
    presets.push({ id: item.id, name: item.name, sourceId: "wechat", intentId: item.id });
  }
  const contextPresets: PhoneContextData = { version: 2, presets };
  const wechatIntents: WechatIntentData = { version: 1, intents };
  validateContextData(contextPresets);
  validateWechatIntentData(wechatIntents);
  return structuredClone({ contextPresets, wechatIntents });
}
