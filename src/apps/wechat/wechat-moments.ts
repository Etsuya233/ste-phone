import type { WechatData, WechatPerson } from "./wechat.ts";

export interface MomentImage {
  readonly description: string;
  readonly prompt?: string;
  readonly image?: { readonly id: string; readonly imagePath: string };
}

export type MomentMedia =
  | { readonly type: "none" }
  | { readonly type: "images"; readonly items: readonly MomentImage[] }
  | { readonly type: "video"; readonly description: string };

export interface MomentContent {
  readonly text: string;
  readonly media: MomentMedia;
}
/** 页面持有未发布内容；作者在生成时固定，只有显式发布才创建记录。 */
export interface MomentDraft extends MomentContent {
  readonly author: WechatPerson;
}

export interface MomentReplyTarget {
  readonly commentId: string;
  /** 删除原评论后仍保留署名，不保存原评论正文。 */
  readonly author: WechatPerson;
}
export interface MomentComment {
  readonly id: string;
  readonly author: WechatPerson;
  readonly text: string;
  readonly createdAt: string;
  readonly replyTo?: MomentReplyTarget;
}
export interface WechatMoment extends MomentContent {
  readonly id: string;
  readonly author: WechatPerson;
  readonly createdAt: string;
  readonly comments: readonly MomentComment[];
}

/** 保存提交时生成记录身份与设备时间；AI 批次传入同一时刻，顺序由追加位置决定。 */
export function createMomentRecord(author: WechatPerson, createdAt = new Date().toISOString()) {
  return {
    id: [...crypto.getRandomValues(new Uint32Array(4))]
      .map((value) => value.toString(16).padStart(8, "0"))
      .join(""),
    author,
    createdAt,
  };
}

/** 媒体描述与正文均为纯文本；只去首尾空白，内部段落保持原样。 */
export function normalizeMomentContent(content: MomentContent): MomentContent {
  const text = content.text.trim();
  let media: MomentMedia;
  switch (content.media.type) {
    case "none":
      if (
        "description" in content.media ||
        "items" in content.media ||
        "descriptions" in content.media
      ) {
        throw new Error("纯文字动态不能包含媒体描述");
      }
      media = { type: "none" };
      break;
    case "images": {
      if ("description" in content.media) {
        throw new Error("图片和视频不能出现在同一条动态中");
      }
      if (!Array.isArray(content.media.items) || "descriptions" in content.media) {
        throw new Error("朋友圈图片数据无效");
      }
      const items = content.media.items.map((item) => {
        if (!item || typeof item.description !== "string" || !item.description.trim()) {
          throw new Error("图片需要非空描述");
        }
        if (item.prompt !== undefined && (typeof item.prompt !== "string" || !item.prompt.trim())) {
          throw new Error("绘图 Prompt 不能为空");
        }
        if (
          item.image !== undefined &&
          (!item.image ||
            typeof item.image.id !== "string" ||
            !item.image.id.trim() ||
            typeof item.image.imagePath !== "string" ||
            !item.image.imagePath.trim())
        ) {
          throw new Error("朋友圈图片引用无效");
        }
        return {
          description: item.description.trim(),
          ...(item.prompt === undefined ? {} : { prompt: item.prompt.trim() }),
          ...(item.image === undefined
            ? {}
            : { image: { id: item.image.id, imagePath: item.image.imagePath } }),
        };
      });
      if (items.length < 1 || items.length > 9) {
        throw new Error("图片需要 1—9 条非空描述");
      }
      media = { type: "images", items };
      break;
    }
    case "video": {
      if ("items" in content.media || "descriptions" in content.media) {
        throw new Error("图片和视频不能出现在同一条动态中");
      }
      const description = content.media.description.trim();
      if (!description) {
        throw new Error("请填写视频描述");
      }
      media = { type: "video", description };
      break;
    }
    default:
      throw new Error("朋友圈媒体类型无效");
  }
  if (!text && media.type === "none") {
    throw new Error("请填写正文或媒体描述");
  }
  return { text, media };
}

/** 发布页用它提前标出不能提交的位置，保存阶段仍由 normalizeMomentContent 做最终校验。 */
export type MomentDraftIssue =
  | { readonly kind: "empty" | "video"; readonly message: string }
  | { readonly kind: "image"; readonly index: number; readonly message: string };

export function momentDraftIssue(content: MomentContent): MomentDraftIssue | null {
  if (content.media.type === "images") {
    if (!content.media.items.length) {
      return { kind: "empty", message: "添加至少一张图片。" };
    }
    const index = content.media.items.findIndex((item) => !item.description.trim());
    if (index >= 0) {
      return { kind: "image", index, message: `第 ${index + 1} 张图片需要填写描述。` };
    }
    return null;
  }
  if (content.media.type === "video") {
    return content.media.description.trim()
      ? null
      : { kind: "video", message: "填写视频描述后可以发布。" };
  }
  return content.text.trim() ? null : { kind: "empty", message: "写点什么，或添加图片、视频。" };
}

export function addMoment(data: WechatData, moment: WechatMoment): WechatData {
  const scopeId = moment.author.scopeId;
  const moments = data.moments?.[scopeId] ?? [];
  if (moments.some((item) => item.id === moment.id)) {
    throw new Error("朋友圈动态 ID 重复");
  }
  return { ...data, moments: { ...data.moments, [scopeId]: [...moments, moment] } };
}

/** 回复只指向同一动态中已经存在的评论；批量生成也按先后顺序应用这条规则。 */
export function addMomentComment(moment: WechatMoment, comment: MomentComment): WechatMoment {
  if (comment.author.scopeId !== moment.author.scopeId) {
    throw new Error("朋友圈评论人物不属于当前资料空间");
  }
  if (!comment.text.trim()) {
    throw new Error("请填写评论内容");
  }
  if (moment.comments.some((item) => item.id === comment.id)) {
    throw new Error("朋友圈评论 ID 重复");
  }
  if (comment.replyTo) {
    const target = moment.comments.find((item) => item.id === comment.replyTo!.commentId);
    if (
      !target ||
      target.author.id !== comment.replyTo.author.id ||
      target.author.scopeId !== comment.replyTo.author.scopeId
    ) {
      throw new Error("回复目标已删除或不属于当前动态");
    }
  }
  return { ...moment, comments: [...moment.comments, { ...comment, text: comment.text.trim() }] };
}

export function removeMomentComment(
  moment: WechatMoment,
  commentId: string,
  account: WechatPerson,
): WechatMoment {
  const comment = moment.comments.find((item) => item.id === commentId);
  if (!comment) {
    throw new Error("朋友圈评论不存在");
  }
  assertMomentOwner(comment.author, account);
  // 其他回复继续引用原 ID 和署名，展示时由目标是否仍存在判断删除状态。
  return { ...moment, comments: moment.comments.filter((item) => item.id !== commentId) };
}

export function assertMomentOwner(author: WechatPerson, account: WechatPerson): void {
  if (author.id !== account.id || author.scopeId !== account.scopeId) {
    throw new Error("只能删除当前帐号发布的内容");
  }
}

/** 图片槽位按当前草稿/动态顺序寻址，拒绝非图片媒体和失效索引。 */
export function momentImageAt(moment: MomentContent, index: number): MomentImage {
  if (
    moment.media.type !== "images" ||
    !Number.isSafeInteger(index) ||
    index < 0 ||
    !moment.media.items[index]
  ) {
    throw new Error("朋友圈图片位置无效");
  }
  return moment.media.items[index]!;
}
