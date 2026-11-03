import { pendingWechatMessages } from "./wechat.ts";
import type { WechatConversation, WechatMemoryBarrier } from "./wechat.ts";

/** 消息 ID 是唯一锚点；损坏屏障必须阻断生成，不能扩大模型读取范围。 */
export function wechatMemoryBoundaries(conversation: WechatConversation) {
  const barriers = conversation.memoryBarriers;
  if (barriers === undefined) {
    return [];
  }
  if (!Array.isArray(barriers)) {
    throw new Error("微信记忆屏障数据须为数组");
  }
  const ids = new Set<string>();
  const positions = new Set<number>();
  return barriers
    .map((barrier: WechatMemoryBarrier) => {
      if (
        !barrier ||
        typeof barrier.id !== "string" ||
        !barrier.id ||
        typeof barrier.enabled !== "boolean" ||
        (barrier.afterMessageId !== null && typeof barrier.afterMessageId !== "string")
      ) {
        throw new Error("微信记忆屏障字段无效");
      }
      const anchor =
        barrier.afterMessageId === null
          ? -1
          : conversation.messages.findIndex((message) => message.id === barrier.afterMessageId);
      if (barrier.afterMessageId !== null && anchor < 0) {
        throw new Error("微信记忆屏障对应的消息不存在");
      }
      const position = anchor + 1;
      if (ids.has(barrier.id) || positions.has(position)) {
        throw new Error("微信记忆屏障 ID 或位置重复");
      }
      ids.add(barrier.id);
      positions.add(position);
      return { barrier, position };
    })
    .toSorted((a, b) => a.position - b.position);
}

export function selectWechatMemory(
  conversation: WechatConversation,
  senderId: string,
  limit: number,
) {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("历史消息条数须为正安全整数");
  }
  const boundaries = wechatMemoryBoundaries(conversation);
  const effective = boundaries.findLast((item) => item.barrier.enabled);
  const eligible = conversation.messages.slice(effective?.position ?? 0);
  const queued = pendingWechatMessages(conversation, senderId);
  const queuedIds = new Set(queued.map((message) => message.id));
  const pending = eligible.filter((message) => queuedIds.has(message.id));
  const start = pending.length
    ? eligible.findIndex((message) => message.id === pending[0]!.id)
    : eligible.length;
  const windowStart = Math.min(start, Math.max(0, eligible.length - limit));
  return { eligible, queued, pending, start, windowStart };
}
