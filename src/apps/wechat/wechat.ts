import type { CharacterProfile } from "../data-source/public.ts";
import type { WechatMoment } from "./wechat-moments.ts";
import type { MomentGenerationState } from "./wechat-moments-session.ts";

export interface WechatPerson {
  readonly id: string;
  readonly scopeId: string;
  readonly name: string;
}
export interface TextContent {
  readonly type: "text";
  readonly text: string;
}
export interface WechatMessage {
  readonly id: string;
  readonly senderId: string;
  readonly content: TextContent;
  readonly createdAt: string;
  readonly recalled?: true;
  readonly reply?: { readonly batchId: string; readonly triggerMessageId?: string };
}
export interface WechatMemoryBarrier {
  readonly id: string;
  readonly afterMessageId: string | null;
  readonly enabled: boolean;
}
export interface WechatConversation {
  readonly id: string;
  readonly people: readonly [WechatPerson, WechatPerson];
  readonly messages: readonly WechatMessage[];
  /** 待回复边界按发言人物保存，切帐号后仍能恢复原视角的待回复消息。 */
  readonly pendingReplies?: Readonly<Record<string, string>>;
  /** 完成截止包含屏障明确跳过的旧队列，与 AI 实际阅读的触发消息分别记录。 */
  readonly pendingCompletedThrough?: Readonly<Record<string, string | null>>;
  readonly memoryBarriers?: readonly WechatMemoryBarrier[];
}
export interface WechatData {
  readonly version: 4;
  readonly account: WechatPerson | null;
  readonly conversations: readonly WechatConversation[];
  /** 旧 v1 数据未填写指导；按稳定空间、稳定人物身份保存，所有微信帐号共享。 */
  readonly replyGuidance?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** 缺少字段的旧 v1 数据表示空朋友圈；每个稳定空间独立保留追加顺序。 */
  readonly moments?: Readonly<Record<string, readonly WechatMoment[]>>;
}
export type ReplyState =
  | { readonly status: "idle" }
  | { readonly status: "sending"; readonly conversationId: string }
  | { readonly status: "running" | "saving"; readonly conversationId: string }
  | {
      readonly status: "error";
      readonly conversationId: string;
      readonly error: string;
      readonly retry: boolean;
    };
export interface WechatSnapshot {
  readonly chatId: string | null;
  readonly data: WechatData;
  readonly people: readonly CharacterProfile[];
  readonly scopeId: string | null;
  /** 阅读范围可在资料断开后保留；新增操作仍须核对当前有效 scopeId 与人物。 */
  readonly momentsScopeId: string | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly reply: ReplyState;
  readonly momentGeneration: MomentGenerationState;
  readonly writeBusy: boolean;
  readonly barrierSaving: boolean;
  readonly operationError: string | null;
}
export const emptyWechat = (): WechatData => ({ version: 4, account: null, conversations: [] });
export const conversationId = (scopeId: string, a: string, b: string) =>
  JSON.stringify([scopeId, ...[a, b].sort()]);

export function createWechatMessage(senderId: string, content: TextContent): WechatMessage {
  return {
    id: [...crypto.getRandomValues(new Uint8Array(16))]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join(""),
    senderId,
    content,
    createdAt: new Date().toISOString(),
  };
}

/** 旧历史通过已完成回复的触发消息恢复边界，已有成功回复不会再次进入待回复范围。 */
export function pendingWechatMessages(
  conversation: WechatConversation,
  senderId: string,
  includeRecalled = false,
): readonly WechatMessage[] {
  // 写入队列边界时保留撤回消息的位置，取消撤回可恢复尚未完成的输入。
  const explicit = conversation.pendingReplies?.[senderId];
  if (explicit) {
    const start = conversation.messages.findIndex((message) => message.id === explicit);
    if (start < 0) {
      throw new Error("微信待回复消息边界不存在");
    }
    return conversation.messages
      .slice(start)
      .filter((message) => message.senderId === senderId && (includeRecalled || !message.recalled));
  }
  const completed = conversation.pendingCompletedThrough?.[senderId];
  if (completed !== undefined) {
    const position =
      completed === null
        ? -1
        : conversation.messages.findIndex((message) => message.id === completed);
    if (
      completed !== null &&
      (position < 0 || conversation.messages[position]!.senderId !== senderId)
    ) {
      throw new Error("微信队列完成截止位置无效");
    }
    return conversation.messages
      .slice(position + 1)
      .filter(
        (message) =>
          message.senderId === senderId && !message.reply && (includeRecalled || !message.recalled),
      );
  }
  const replied = conversation.messages.findLast(
    (message) => message.senderId !== senderId && message.reply?.triggerMessageId !== undefined,
  );
  const boundary = replied
    ? conversation.messages.findIndex((message) => message.id === replied.reply!.triggerMessageId)
    : -1;
  if (replied && boundary < 0) {
    throw new Error("微信回复对应的触发消息不存在");
  }
  return conversation.messages
    .slice(boundary + 1)
    .filter(
      (message) =>
        message.senderId === senderId && !message.reply && (includeRecalled || !message.recalled),
    );
}

/** 首条待回复消息决定本轮边界，后续文字与表情沿用该边界。 */
export function appendWechatMessage(
  conversation: WechatConversation,
  message: WechatMessage,
): WechatConversation {
  const pending = pendingWechatMessages(conversation, message.senderId, true);
  return {
    ...conversation,
    messages: [...conversation.messages, message],
    pendingReplies: {
      ...conversation.pendingReplies,
      [message.senderId]: pending[0]?.id ?? message.id,
    },
  };
}

/** 失败仅撤回本次乐观消息与它设置的边界，保留期间更新的人物资料。 */
export function rollbackWechatMessage(
  data: WechatData,
  original: WechatConversation,
  messageId: string,
): WechatData {
  const current = data.conversations.find((item) => item.id === original.id)!;
  const messages = current.messages.filter((message) => message.id !== messageId);
  return {
    ...data,
    conversations:
      messages.length === 0 && !current.memoryBarriers?.length
        ? data.conversations.filter((item) => item.id !== original.id)
        : data.conversations.map((item) =>
            item.id === original.id
              ? { ...current, messages, pendingReplies: original.pendingReplies }
              : item,
          ),
  };
}
