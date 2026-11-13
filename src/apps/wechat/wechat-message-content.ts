import { isGalleryImageReference, type GalleryImageReference } from "../gallery/public.ts";
import type { WechatConversation } from "./wechat.ts";

export interface TextContent {
  readonly type: "text";
  readonly text: string;
}

export interface ImageContent {
  readonly type: "image";
  readonly description: string;
  readonly prompt: string;
  readonly image?: GalleryImageReference;
}

export interface RedPacketContent {
  readonly type: "redPacket";
  readonly amountFen: number;
  readonly note: string;
  readonly status: "pending" | "claimed";
}

export interface TransferContent {
  readonly type: "transfer";
  readonly amountFen: number;
  readonly note: string;
  readonly status: "pending" | "received" | "returned";
}

export interface SystemContent {
  readonly type: "system";
  readonly text: string;
}

export type WechatMessageContent =
  TextContent | ImageContent | RedPacketContent | TransferContent | SystemContent;
export type WechatPaymentAction = "claim" | "receive" | "return";

export function isWechatAmountFen(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function parseWechatAmount(text: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text.trim());
  const fen = match ? Number(match[1] + (match[2] ?? "").padEnd(2, "0")) : NaN;
  if (!isWechatAmountFen(fen)) {
    throw new Error("请输入大于零、最多两位小数的金额");
  }
  return fen;
}

export function formatWechatAmount(amountFen: number): string {
  const cents = amountFen % 100;
  return `${(amountFen - cents) / 100}.${String(cents).padStart(2, "0")}`;
}

export function validateWechatMessageContent(
  value: unknown,
): asserts value is WechatMessageContent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("微信消息内容无效");
  }
  const content = value as Record<string, unknown>;
  switch (content.type) {
    case "text":
    case "system":
      if (typeof content.text === "string" && content.text.trim()) {
        return;
      }
      break;
    case "image":
      if (
        typeof content.description === "string" &&
        content.description.trim() &&
        typeof content.prompt === "string" &&
        (content.image === undefined || isGalleryImageReference(content.image))
      ) {
        return;
      }
      break;
    case "redPacket":
    case "transfer":
      if (
        isWechatAmountFen(content.amountFen) &&
        typeof content.note === "string" &&
        (content.status === "pending" ||
          (content.type === "redPacket"
            ? content.status === "claimed"
            : content.status === "received" || content.status === "returned"))
      ) {
        return;
      }
      break;
  }
  throw new Error("微信消息内容无效");
}

/** 单聊的另一方才可处理卡片；重复领取或收款由同一状态约束拒绝。 */
export function applyWechatPaymentAction(
  conversation: WechatConversation,
  actorId: string,
  messageId: string,
  action: WechatPaymentAction,
): WechatConversation {
  if (conversation.kind === "group") {
    throw new Error("群聊暂不支持红包和转账");
  }
  const index = conversation.messages.findIndex((message) => message.id === messageId);
  const target = conversation.messages[index];
  if (!target || target.recalled) {
    throw new Error("红包或转账已撤回或不存在");
  }
  if (actorId === target.senderId || !conversation.people.some(({ id }) => id === actorId)) {
    throw new Error("只有接收方可以处理红包或转账");
  }
  const { content } = target;
  if (content.type !== "redPacket" && content.type !== "transfer") {
    throw new Error("该消息不是红包或转账");
  }
  if (content.status !== "pending") {
    throw new Error("该红包或转账已处理");
  }
  let next: RedPacketContent | TransferContent;
  if (content.type === "redPacket" && action === "claim") {
    next = { ...content, status: "claimed" };
  } else if (content.type === "transfer" && (action === "receive" || action === "return")) {
    next = { ...content, status: action === "receive" ? "received" : "returned" };
  } else {
    throw new Error("该卡片不支持此操作");
  }
  return {
    ...conversation,
    messages: conversation.messages.with(index, { ...target, content: next }),
  };
}

export function wechatPaymentStatus(content: RedPacketContent | TransferContent): string {
  if (content.type === "redPacket") {
    return content.status === "claimed" ? "已领取" : "待领取";
  }
  switch (content.status) {
    case "pending":
      return "待收款";
    case "received":
      return "已收款";
    case "returned":
      return "已退回";
  }
}

/** App Intent 只引用角色可读的消息内容，生图指令和文件路径留给媒体流程。 */
export function describeWechatMessageContent(content: WechatMessageContent): string {
  switch (content.type) {
    case "text": {
      const sticker = /^\[\[sticker:([^:]+):(.+)\]\]$/.exec(content.text);
      return sticker ? `[表情：${sticker[1]} / ${sticker[2]}]` : content.text;
    }
    case "system":
      return content.text;
    case "image":
      return `[图片：${content.description}]`;
    case "redPacket":
    case "transfer": {
      const kind = content.type === "redPacket" ? "红包" : "转账";
      const note = content.note ? `，${content.note}` : "";
      return `[${kind}：¥${formatWechatAmount(content.amountFen)}，${wechatPaymentStatus(content)}${note}]`;
    }
  }
}
