import type { AiTransport } from "../../core/ai/public.ts";
import type { DataAppPublic, CharacterProfile } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import { generateWechatReply } from "./wechat-generation.ts";
import { readWechatPrompt } from "./wechat-context.ts";
import { createWechatMessage, pendingWechatMessages, type WechatConversation } from "./wechat.ts";
import { selectWechatMemory } from "./wechat-memory.ts";
import { applyWechatPaymentAction } from "./wechat-message-content.ts";
import type { WechatReplyOutput } from "./wechat-reply-output.ts";
import { wechatStickerCatalog, type WechatStickerPack } from "./wechat-stickers.ts";

/** 以本轮固定材料生成下一份会话；卡片操作、回复消息和队列完成边界一起交付保存。 */
export async function generateRepliedWechatConversation(input: {
  data: DataAppPublic;
  connections: ModelConnectionsReader;
  transport: AiTransport;
  sender: CharacterProfile;
  recipient: CharacterProfile;
  replyGuidance: string;
  historyMessageLimit: number;
  conversation: WechatConversation;
  signal: AbortSignal;
  stickerPacks: readonly WechatStickerPack[];
}): Promise<WechatConversation> {
  const { data, connections, transport, sender, recipient, conversation, signal } = input;
  const connectionId = connections.getSnapshot().defaultModelConnectionId;
  if (!connectionId) {
    throw new Error("请先在设置中选择默认模型连接");
  }
  const connection = connections.getConnection(connectionId);
  // 在本轮开始时固定可用表情；期间切换开关只影响展示与下一轮生成。
  const stickers = wechatStickerCatalog(input.stickerPacks);
  const prompt = await readWechatPrompt(
    data,
    { ...data.getSnapshot().context },
    sender,
    recipient,
    conversation,
    input.historyMessageLimit,
    stickers,
  );
  signal.throwIfAborted();
  const output = await generateWechatReply({
    transport,
    connection,
    prompt,
    signal,
    stickers,
    replyGuidance: input.replyGuidance,
  });
  const memory = selectWechatMemory(conversation, sender.id, input.historyMessageLimit);
  return applyWechatReply(conversation, sender.id, recipient.id, memory, output);
}

function applyWechatReply(
  conversation: WechatConversation,
  senderId: string,
  recipientId: string,
  { eligible, pending, windowStart }: ReturnType<typeof selectWechatMemory>,
  { messages, paymentActions }: WechatReplyOutput,
) {
  // 与提示词使用同一读取范围，猜中的 ID 也不能越过记忆屏障或历史窗口。
  const visibleIds = new Set(eligible.slice(windowStart).map(({ id }) => id));
  let next = conversation;
  for (const { messageId, action } of paymentActions) {
    if (!visibleIds.has(messageId)) {
      throw new Error("微信回复引用了本轮未提供的卡片");
    }
    next = applyWechatPaymentAction(next, recipientId, messageId, action);
  }
  const replies = messages.map((content) => createWechatMessage(recipientId, content));
  const batchId = replies[0]?.id;
  const triggerMessageId = pending.at(-1)?.id;
  const appended = batchId
    ? replies.map((message) => ({
        ...message,
        reply: triggerMessageId ? { batchId, triggerMessageId } : { batchId },
      }))
    : [];
  // 即使本轮只操作卡片，也已处理完本轮队列（包含屏障明确跳过的旧消息）。
  const completed = pendingWechatMessages(conversation, senderId, true).at(-1)?.id;
  const pendingCompletedThrough = completed
    ? { ...conversation.pendingCompletedThrough, [senderId]: completed }
    : conversation.pendingCompletedThrough;
  const pendingReplies = { ...conversation.pendingReplies };
  delete pendingReplies[senderId];
  return {
    ...next,
    messages: [...next.messages, ...appended],
    pendingReplies,
    pendingCompletedThrough,
  };
}
