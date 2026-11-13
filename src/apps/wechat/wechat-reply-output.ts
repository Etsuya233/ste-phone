import {
  isWechatAmountFen,
  type WechatMessageContent,
  type WechatPaymentAction,
} from "./wechat-message-content.ts";
import type { wechatStickerCatalog } from "./wechat-stickers.ts";

type Stickers = ReturnType<typeof wechatStickerCatalog>;

export interface WechatReplyOutput {
  messages: WechatMessageContent[];
  paymentActions: { messageId: string; action: WechatPaymentAction }[];
}

/** 格式错误使整批回复失败；图库引用和支付状态由应用维护。 */
export function parseWechatReply(text: string, stickers: Stickers = []): WechatReplyOutput {
  const value = record(JSON.parse(text));
  fields(value, "paymentActions" in value ? ["messages", "paymentActions"] : ["messages"]);
  const rawActions = "paymentActions" in value ? value.paymentActions : [];
  if (!Array.isArray(value.messages) || !Array.isArray(rawActions)) {
    throw new Error("微信回复的 messages 和 paymentActions 须为数组");
  }
  if (!value.messages.length && !rawActions.length) {
    throw new Error("微信回复须包含消息或卡片操作");
  }
  const messages = value.messages.map((message) => parseMessage(message, stickers));
  const paymentActions = rawActions.map(parsePaymentAction);
  if (new Set(paymentActions.map(({ messageId }) => messageId)).size !== paymentActions.length) {
    throw new Error("同一张微信卡片在一轮回复中只能操作一次");
  }
  return { messages, paymentActions };
}

function parseMessage(value: unknown, stickers: Stickers): WechatMessageContent {
  const message = record(value);
  switch (message.type) {
    case "text": {
      fields(message, ["type", "text"]);
      if (typeof message.text !== "string" || !message.text.trim()) {
        throw new Error("微信回复文字不能为空");
      }
      const text = message.text.trim();
      if (text.includes("[[sticker:") && !stickers.some((sticker) => sticker.marker === text)) {
        throw new Error("微信回复引用了不可用的表情，或将表情与文字混写");
      }
      return { type: "text", text };
    }
    case "image": {
      fields(message, ["type", "description", "prompt"]);
      if (
        typeof message.description !== "string" ||
        !message.description.trim() ||
        typeof message.prompt !== "string" ||
        !message.prompt.trim()
      ) {
        throw new Error("微信回复图片须包含描述和绘图 Prompt");
      }
      return {
        type: "image",
        description: message.description.trim(),
        prompt: message.prompt.trim(),
      };
    }
    case "redPacket":
    case "transfer": {
      fields(message, ["type", "amountFen", "note"]);
      if (!isWechatAmountFen(message.amountFen) || typeof message.note !== "string") {
        throw new Error("微信回复卡片须包含正整数分金额和文字备注");
      }
      return {
        type: message.type,
        amountFen: message.amountFen,
        note: message.note.trim(),
        status: "pending",
      };
    }
    default:
      throw new Error("微信回复消息类型无效");
  }
}

function parsePaymentAction(value: unknown): WechatReplyOutput["paymentActions"][number] {
  const item = record(value);
  fields(item, ["messageId", "action"]);
  const { messageId, action } = item;
  if (
    typeof messageId !== "string" ||
    !messageId.trim() ||
    (action !== "claim" && action !== "receive" && action !== "return")
  ) {
    throw new Error("微信回复卡片操作无效");
  }
  return { messageId, action };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("微信回复结构无效");
  }
  return value as Record<string, unknown>;
}

function fields(value: Record<string, unknown>, names: readonly string[]): void {
  if (Object.keys(value).length !== names.length || names.some((name) => !(name in value))) {
    throw new Error("微信回复字段无效");
  }
}

/** 所有发言在整批保存前校验，指定模式还要求每位所选人物发言。 */
export function parseWechatGroupReply(
  text: string,
  allowedIds: readonly string[],
  requireAll: boolean,
  stickers: Stickers,
): { senderId: string; content: WechatMessageContent }[] {
  const value = record(JSON.parse(text));
  fields(value, ["messages"]);
  if (!Array.isArray(value.messages) || !value.messages.length) {
    throw new Error("微信群聊回复须包含至少一条消息");
  }
  const spoken = new Set<string>();
  const replies = value.messages.map((raw: unknown) => {
    const { senderId, ...message } = record(raw);
    if (typeof senderId !== "string" || !allowedIds.includes(senderId)) {
      throw new Error("微信群聊回复包含本轮无权发言的人物");
    }
    if (message.type !== "text" && message.type !== "image") {
      throw new Error("微信群聊回复仅支持文字、表情和图片");
    }
    spoken.add(senderId);
    return { senderId, content: parseMessage(message, stickers) };
  });
  if (requireAll && allowedIds.some((id) => !spoken.has(id))) {
    throw new Error("微信群聊回复缺少本轮指定人物的发言");
  }
  return replies;
}
