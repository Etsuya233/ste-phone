import { normalizeMomentContent, type MomentContent } from "./wechat-moments.ts";

export type GeneratedMomentComment = {
  readonly authorId: string;
  readonly text: string;
  readonly replyTo:
    | null
    | { readonly type: "existing"; readonly commentId: string }
    | { readonly type: "batch"; readonly index: number };
};

/** 严格解析整次输出，任何一项不合法都终止，不自动修复或保存前半批。 */
export function parseGeneratedMoment(text: string, authorId: string): MomentContent {
  const value = record(JSON.parse(text));
  fields(value, ["authorId", "text", "media"]);
  if (value.authorId !== authorId || typeof value.text !== "string") {
    throw new Error("朋友圈发布人物或正文无效");
  }
  const media = record(value.media);
  switch (media.type) {
    case "none":
      fields(media, ["type"]);
      return normalizeMomentContent({ text: value.text, media: { type: "none" } });
    case "images":
      fields(media, ["type", "descriptions"]);
      if (
        !Array.isArray(media.descriptions) ||
        media.descriptions.some((item) => typeof item !== "string")
      ) {
        throw new Error("朋友圈图片描述无效");
      }
      return normalizeMomentContent({
        text: value.text,
        media: { type: "images", descriptions: media.descriptions as string[] },
      });
    case "video":
      fields(media, ["type", "description"]);
      if (typeof media.description !== "string") {
        throw new Error("朋友圈视频描述无效");
      }
      return normalizeMomentContent({
        text: value.text,
        media: { type: "video", description: media.description },
      });
    default:
      throw new Error("朋友圈媒体类型无效");
  }
}

export function parseGeneratedInteraction(
  text: string,
  allowedAuthors: ReadonlySet<string>,
  existingComments: ReadonlySet<string>,
  requiredAuthorIds: readonly string[] = [],
): readonly GeneratedMomentComment[] {
  const value = record(JSON.parse(text));
  fields(value, ["comments"]);
  if (!Array.isArray(value.comments) || value.comments.length > 5) {
    throw new Error("朋友圈互动需要 0—5 条评论");
  }
  const comments = value.comments.map((raw, index) => {
    const comment = record(raw);
    fields(comment, ["authorId", "text", "replyTo"]);
    if (typeof comment.authorId !== "string" || !allowedAuthors.has(comment.authorId)) {
      throw new Error("朋友圈互动使用了不允许的人物");
    }
    if (typeof comment.text !== "string" || !comment.text.trim()) {
      throw new Error("朋友圈互动评论不能为空");
    }
    return {
      authorId: comment.authorId,
      text: comment.text.trim(),
      replyTo: parseReplyTarget(comment.replyTo, index, existingComments),
    };
  });
  const authors = new Set(comments.map((comment) => comment.authorId));
  if (requiredAuthorIds.some((id) => !authors.has(id))) {
    throw new Error("朋友圈互动遗漏了指定参与人物，整批未保存");
  }
  return comments;
}

function parseReplyTarget(
  value: unknown,
  index: number,
  existing: ReadonlySet<string>,
): GeneratedMomentComment["replyTo"] {
  if (value === null) {
    return null;
  }
  const reply = record(value);
  if (reply.type === "existing") {
    fields(reply, ["type", "commentId"]);
    if (typeof reply.commentId !== "string" || !existing.has(reply.commentId)) {
      throw new Error("朋友圈回复目标未提供或已删除");
    }
    return { type: "existing", commentId: reply.commentId };
  }
  if (reply.type === "batch") {
    fields(reply, ["type", "index"]);
    if (
      !Number.isSafeInteger(reply.index) ||
      (reply.index as number) < 0 ||
      (reply.index as number) >= index
    ) {
      throw new Error("朋友圈批内回复只能指向前序评论");
    }
    return { type: "batch", index: reply.index as number };
  }
  throw new Error("朋友圈回复类型无效");
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("朋友圈模型输出结构无效");
  }
  return value as Record<string, unknown>;
}
function fields(value: Record<string, unknown>, names: readonly string[]): void {
  if (Object.keys(value).length !== names.length || names.some((name) => !(name in value))) {
    throw new Error("朋友圈模型输出字段无效");
  }
}
