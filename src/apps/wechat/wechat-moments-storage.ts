import { normalizeMomentContent, type WechatMoment } from "./wechat-moments.ts";

/** 元数据来自宿主或 localStorage，运行时校验，禁止把损坏数据当作空历史。 */
export function validateWechatMoments(value: unknown): void {
  if (value === undefined) {
    return; // 尚未发布动态时可省略朋友圈字段。
  }
  const scopes = object(value);
  for (const [scopeId, records] of Object.entries(scopes)) {
    if (!scopeId || !Array.isArray(records)) {
      throw new Error("朋友圈空间数据无效");
    }
    const ids = new Set<string>();
    for (const record of records) {
      validateMoment(record, scopeId);
      if (ids.has(record.id)) {
        throw new Error("朋友圈动态 ID 重复");
      }
      ids.add(record.id);
    }
  }
}

function validateMoment(value: unknown, scopeId: string): asserts value is WechatMoment {
  const record = object(value);
  validateRecord(record, scopeId);
  if (typeof record.text !== "string") {
    throw new Error("朋友圈正文无效");
  }
  normalizeMomentContent(record as unknown as WechatMoment);
  validateComments(record.comments, scopeId);
}

/** 评论按追加顺序校验引用；已删除的目标只有署名，不建立空评论占位。 */
function validateComments(comments: unknown, scopeId: string): void {
  if (!Array.isArray(comments)) {
    throw new Error("朋友圈评论数据无效");
  }
  const preceding = new Map<string, Record<string, unknown>>();
  const allIds = new Set(comments.map((comment) => object(comment).id));
  for (const value of comments) {
    const comment = object(value);
    validateRecord(comment, scopeId);
    if (preceding.has(comment.id as string)) {
      throw new Error("朋友圈评论 ID 重复");
    }
    if (typeof comment.text !== "string" || !comment.text.trim()) {
      throw new Error("朋友圈评论内容无效");
    }
    if (comment.replyTo !== undefined) {
      const reply = object(comment.replyTo);
      nonempty(reply.commentId);
      validateAuthor(reply.author, scopeId);
      // 存在的目标必须在本评论之前；不存在的目标表示已删除，仅保留身份快照。
      const target = preceding.get(reply.commentId as string);
      if (allIds.has(reply.commentId) && !target) {
        throw new Error("朋友圈回复不能指向自身或后续评论");
      }
      if (target && object(target.author).id !== object(reply.author).id) {
        throw new Error("朋友圈回复目标人物不匹配");
      }
    }
    preceding.set(comment.id as string, comment);
  }
}

function validateRecord(record: Record<string, unknown>, scopeId: string): void {
  nonempty(record.id);
  validateAuthor(record.author, scopeId);
  if (typeof record.createdAt !== "string" || !Number.isFinite(Date.parse(record.createdAt))) {
    throw new Error("朋友圈保存时间无效");
  }
}

function validateAuthor(value: unknown, scopeId: string): void {
  const author = object(value);
  nonempty(author.id);
  nonempty(author.name);
  if (author.scopeId !== scopeId) {
    throw new Error("朋友圈人物不属于所属资料空间");
  }
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("朋友圈数据结构无效");
  }
  return value as Record<string, unknown>;
}

function nonempty(value: unknown): void {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("朋友圈身份或署名无效");
  }
}

/** v1 升级步骤将旧动态级媒体转换为有序附件；调用方在副本上执行。 */
export function migrateWechatMoments(value: unknown): void {
  if (value === undefined) {
    return;
  }
  for (const records of Object.values(object(value))) {
    if (!Array.isArray(records)) {
      throw new Error("朋友圈空间数据无效");
    }
    for (const raw of records) {
      const record = object(raw);
      if (!Array.isArray(record.media)) {
        record.media = migrateLegacyMedia(object(record.media));
      }
    }
  }
  validateWechatMoments(value);
}

/** 只接受已发布的三种旧结构，混用字段与损坏内容直接报错。 */
function migrateLegacyMedia(media: Record<string, unknown>): unknown[] {
  const keys = Object.keys(media);
  if (media.type === "none" && keys.length === 1) {
    return [];
  }
  if (media.type === "video" && keys.length === 2 && "description" in media) {
    return [{ type: "video", description: media.description }];
  }
  if (media.type === "images" && keys.length === 2) {
    if (Array.isArray(media.items) && media.items.length >= 1 && media.items.length <= 9) {
      return media.items.map((item) => {
        const image = object(item);
        if ("type" in image) {
          throw new Error("旧朋友圈图片不能包含媒体类型");
        }
        return { ...image, type: "image" };
      });
    }
    if (
      Array.isArray(media.descriptions) &&
      media.descriptions.length >= 1 &&
      media.descriptions.length <= 9 &&
      media.descriptions.every((description) => typeof description === "string")
    ) {
      return media.descriptions.map((description) => ({ type: "image", description }));
    }
  }
  throw new Error("旧朋友圈媒体数据无效");
}
