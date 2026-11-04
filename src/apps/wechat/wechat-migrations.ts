import { migrateData, type MigrationPlan } from "../../core/storage/migrations.ts";
import { migrateWechatMoments, validateWechatMoments } from "./wechat-moments-storage.ts";
import { wechatMemoryBoundaries } from "./wechat-memory.ts";
import type { WechatConversation, WechatData } from "./wechat.ts";

const wechatMigrations: MigrationPlan<WechatData> = {
  currentVersion: 2,
  steps: [
    {
      from: 1,
      to: 2,
      name: "ordered-moment-media",
      migrate(value) {
        const data = object(value);
        // 已发布的 v1 同时存在描述数组、图片项和有序媒体三种形状，在此一次收口。
        migrateWechatMoments(data.moments);
        return data;
      },
    },
  ],
  validate: validateWechatData,
};

/** 宿主和预览共用读取边界；返回最新结构的副本，保存时机仍归调用方。 */
export function readWechatData(value: unknown): WechatData {
  return migrateData(value, wechatMigrations).data;
}

/** 当前结构只接受媒体数组；历史字段转换仅允许在 v1 → v2 中执行。 */
export function validateWechatData(value: unknown): asserts value is WechatData {
  const data = object(value);
  if (data.version !== 2 || !Array.isArray(data.conversations)) {
    throw new Error("微信数据版本或会话列表无效");
  }
  if (data.account !== null) {
    validatePerson(data.account);
  }
  const ids = new Set<string>();
  for (const conversation of data.conversations) {
    const record = object(conversation);
    nonempty(record.id);
    if (ids.has(record.id)) {
      throw new Error("微信会话 ID 重复");
    }
    ids.add(record.id);
    validateConversation(record);
  }
  if (data.replyGuidance !== undefined) {
    for (const [scopeId, people] of Object.entries(object(data.replyGuidance))) {
      nonempty(scopeId);
      for (const [personId, guidance] of Object.entries(object(people))) {
        nonempty(personId);
        if (typeof guidance !== "string") {
          throw new Error("微信回复指导无效");
        }
      }
    }
  }
  validateWechatMoments(data.moments);
}

function validateConversation(conversation: Record<string, unknown>): void {
  if (
    !Array.isArray(conversation.people) ||
    conversation.people.length !== 2 ||
    !Array.isArray(conversation.messages)
  ) {
    throw new Error("微信会话人物或消息列表无效");
  }
  const people = conversation.people.map(validatePerson);
  if (people[0]!.id === people[1]!.id || people[0]!.scopeId !== people[1]!.scopeId) {
    throw new Error("微信单聊须包含同一资料空间的两位人物");
  }
  const peopleIds = new Set(people.map((person) => person.id));
  const messages = new Map<string, string>();
  for (const raw of conversation.messages) {
    const message = object(raw);
    nonempty(message.id);
    nonempty(message.senderId);
    if (messages.has(message.id) || !peopleIds.has(message.senderId)) {
      throw new Error("微信消息 ID 重复或发言人物无效");
    }
    const content = object(message.content);
    if (
      content.type !== "text" ||
      typeof content.text !== "string" ||
      !content.text.trim() ||
      typeof message.createdAt !== "string" ||
      !Number.isFinite(Date.parse(message.createdAt))
    ) {
      throw new Error("微信消息内容或时间无效");
    }
    if (message.reply !== undefined) {
      const reply = object(message.reply);
      nonempty(reply.batchId);
      if (reply.triggerMessageId !== undefined) {
        nonempty(reply.triggerMessageId);
        if (!messages.has(reply.triggerMessageId)) {
          throw new Error("微信回复对应的触发消息不存在或位于回复之后");
        }
      }
    }
    messages.set(message.id, message.senderId);
  }
  validatePendingBoundaries(conversation.pendingReplies, peopleIds, messages);
  validatePendingBoundaries(conversation.pendingCompletedThrough, peopleIds, messages);
  // 与生成取材复用屏障锚点、位置和开关约束，避免两个边界各自解释同一份数据。
  wechatMemoryBoundaries(conversation as unknown as WechatConversation);
}

function validatePendingBoundaries(
  value: unknown,
  people: ReadonlySet<string>,
  messages: ReadonlyMap<string, string>,
): void {
  if (value === undefined) {
    return;
  }
  for (const [senderId, messageId] of Object.entries(object(value))) {
    if (
      typeof messageId !== "string" ||
      !people.has(senderId) ||
      messages.get(messageId) !== senderId
    ) {
      throw new Error("微信待回复或完成截止位置无效");
    }
  }
}

function validatePerson(value: unknown): { id: string; scopeId: string; name: string } {
  const person = object(value);
  nonempty(person.id);
  nonempty(person.scopeId);
  nonempty(person.name);
  return { id: person.id, scopeId: person.scopeId, name: person.name };
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("微信数据结构无效");
  }
  return value as Record<string, unknown>;
}

function nonempty(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("微信身份或署名无效");
  }
}
