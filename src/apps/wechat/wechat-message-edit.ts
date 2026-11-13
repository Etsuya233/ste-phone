import { pendingWechatMessages, type WechatConversation } from "./wechat.ts";

export type WechatMessageEdit = "recall" | "restore" | "delete";

export function editWechatMessage(
  conversation: WechatConversation,
  accountId: string,
  messageId: string,
  action: WechatMessageEdit,
): WechatConversation {
  const index = conversation.messages.findIndex((message) => message.id === messageId);
  if (index < 0) {
    throw new Error("微信消息不存在");
  }
  const target = conversation.messages[index]!;
  if (target.content.type === "system" && action !== "delete") {
    throw new Error("系统消息无法撤回");
  }
  if (action !== "delete") {
    if (target.senderId !== accountId) {
      throw new Error("只能撤回自己的消息或取消撤回");
    }
    const recalled = action === "recall" ? true : undefined;
    if (target.recalled === recalled) {
      throw new Error(recalled ? "这条消息已撤回" : "这条消息尚未撤回");
    }
    return {
      ...conversation,
      messages: conversation.messages.with(index, { ...target, recalled }),
    };
  }

  const messages = conversation.messages
    .filter((message) => message.id !== messageId)
    .map((message) =>
      message.reply?.triggerMessageId === messageId
        ? { ...message, reply: { batchId: message.reply.batchId } }
        : message,
    );
  const pendingReplies = { ...conversation.pendingReplies };
  const pendingCompletedThrough = { ...conversation.pendingCompletedThrough };
  // 先按原历史求待回复范围。旧聊天的范围可能由即将删除的 AI 回复推导。
  for (const { id } of conversation.people) {
    const first = pendingWechatMessages(conversation, id, true).find(
      (message) => message.id !== messageId,
    );
    if (pendingReplies[id] && first) {
      pendingReplies[id] = first.id;
    } else {
      delete pendingReplies[id];
    }
    const start = first
      ? messages.findIndex((message) => message.id === first.id)
      : messages.length;
    pendingCompletedThrough[id] =
      messages
        .slice(0, start)
        .findLast((message) => message.senderId === id && message.content.type !== "system")?.id ??
      null;
  }
  return {
    ...conversation,
    messages,
    pendingReplies,
    pendingCompletedThrough,
    // 相邻屏障可能落到同一位置，保留各自的身份与开关。
    memoryBarriers: conversation.memoryBarriers?.map((barrier) =>
      barrier.afterMessageId === messageId
        ? { ...barrier, afterMessageId: conversation.messages[index - 1]?.id ?? null }
        : barrier,
    ),
  };
}
