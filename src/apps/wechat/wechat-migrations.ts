import { migrateData, type MigrationPlan } from "../../core/storage/migrations.ts";
import {
  migrateWechatMoments,
  migrateMomentImageSources,
  validateWechatMoments,
} from "./wechat-moments-storage.ts";
import { wechatMemoryBoundaries } from "./wechat-memory.ts";
import { validateWechatMessageContent } from "./wechat-message-content.ts";
import type { WechatConversation, WechatData } from "./wechat.ts";

const wechatMigrations: MigrationPlan<WechatData> = {
  currentVersion: 6,
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
    { from: 2, to: 3, name: "message-recall", migrate: object },
    {
      from: 3,
      to: 4,
      name: "moment-gallery-source",
      migrate(value) {
        const data = object(value);
        migrateMomentImageSources(data.moments);
        return data;
      },
    },
    { from: 4, to: 5, name: "structured-chat-messages", migrate: object },
    {
      from: 5,
      to: 6,
      name: "group-conversations",
      migrate(value) {
        const data = object(value);
        if (!Array.isArray(data.conversations)) {
          throw new Error("微信会话列表无效");
        }
        data.conversations = data.conversations.map((item) => ({
          ...object(item),
          kind: "direct",
        }));
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

/** 读取和写入共用当前结构校验，旧字段由各版本迁移处理。 */
export function validateWechatData(value: unknown): asserts value is WechatData {
  const data = object(value);
  if (data.version !== 6 || !Array.isArray(data.conversations)) {
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
    !conversation.people.length ||
    !Array.isArray(conversation.messages)
  ) {
    throw new Error("微信会话人物或消息列表无效");
  }
  const people = conversation.people.map(validatePerson);
  const peopleIds = new Set(people.map((person) => person.id));
  if (
    peopleIds.size !== people.length ||
    people.some(({ scopeId }) => scopeId !== people[0]!.scopeId)
  ) {
    throw new Error("微信会话人物须唯一且属于同一资料空间");
  }
  const group = conversation.kind === "group";
  if (group) {
    validateGroup(conversation, peopleIds);
  } else if (
    (conversation.kind !== undefined && conversation.kind !== "direct") ||
    people.length !== 2
  ) {
    throw new Error("微信单聊须包含两位人物");
  }
  const messages = new Map<string, string | null>();
  for (const raw of conversation.messages) {
    const message = object(raw);
    nonempty(message.id);
    nonempty(message.senderId);
    if (messages.has(message.id) || !peopleIds.has(message.senderId)) {
      throw new Error("微信消息 ID 重复或发言人物无效");
    }
    validateWechatMessageContent(message.content);
    if (
      group
        ? message.content.type === "redPacket" || message.content.type === "transfer"
        : message.content.type === "system"
    ) {
      throw new Error("当前微信会话不支持此类消息");
    }
    if (
      message.content.type === "system" &&
      (message.recalled !== undefined || message.reply !== undefined)
    ) {
      throw new Error("微信系统消息不能撤回或作为 AI 回复");
    }
    if (typeof message.createdAt !== "string" || !Number.isFinite(Date.parse(message.createdAt))) {
      throw new Error("微信消息时间无效");
    }
    if (message.recalled !== undefined && message.recalled !== true) {
      throw new Error("微信消息撤回状态无效");
    }
    if (message.reply !== undefined) {
      const reply = object(message.reply);
      nonempty(reply.batchId);
      if (reply.triggerMessageId !== undefined) {
        nonempty(reply.triggerMessageId);
        if (!messages.get(reply.triggerMessageId)) {
          throw new Error("微信回复对应的触发消息不存在或位于回复之后");
        }
      }
    }
    messages.set(message.id, message.content.type === "system" ? null : message.senderId);
  }
  validatePendingBoundaries(conversation.pendingReplies, peopleIds, messages);
  validatePendingBoundaries(conversation.pendingCompletedThrough, peopleIds, messages, true);
  // 与生成取材复用屏障锚点、位置和开关约束，避免两个边界各自解释同一份数据。
  wechatMemoryBoundaries(conversation as unknown as WechatConversation);
}

function validateGroup(group: Record<string, unknown>, people: ReadonlySet<string>): void {
  nonempty(group.name);
  const { memberIds, description } = group;
  if (
    typeof description !== "string" ||
    !Array.isArray(memberIds) ||
    !memberIds.length ||
    new Set(memberIds).size !== memberIds.length ||
    memberIds.some((id) => !people.has(id))
  ) {
    throw new Error("微信群资料或当前成员无效");
  }
}

function validatePendingBoundaries(
  value: unknown,
  people: ReadonlySet<string>,
  messages: ReadonlyMap<string, string | null>,
  allowStart = false,
): void {
  if (value === undefined) {
    return;
  }
  for (const [senderId, messageId] of Object.entries(object(value))) {
    if (
      !people.has(senderId) ||
      (!(allowStart && messageId === null) &&
        (typeof messageId !== "string" || messages.get(messageId) !== senderId))
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
