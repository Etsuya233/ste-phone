import {
  galleryImageReference,
  isGalleryImageReference,
  type GalleryImageReference,
} from "../gallery/public.ts";
import type { WechatData, WechatPerson } from "./wechat.ts";

export interface MomentImage {
  readonly type: "image";
  readonly description: string;
  readonly prompt?: string;
  readonly image?: GalleryImageReference;
}

/** 附件按展示顺序保存，图片和视频共享九个名额。 */
export type MomentMedia = readonly (
  MomentImage | { readonly type: "video"; readonly description: string }
)[];

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
  if (!Array.isArray(content.media) || content.media.length > 9) {
    throw new Error("朋友圈媒体需要为数组，最多 9 个");
  }
  const media: MomentMedia = content.media.map((item) => {
    if (!item || (item.type !== "image" && item.type !== "video")) {
      throw new Error("朋友圈媒体类型无效");
    }
    if (typeof item.description !== "string" || !item.description.trim()) {
      throw new Error(item.type === "image" ? "图片需要非空描述" : "请填写视频描述");
    }
    if (item.type === "video") {
      if ("prompt" in item || "image" in item) {
        throw new Error("视频不能包含图片引用或绘图 Prompt");
      }
      return { type: "video", description: item.description.trim() };
    }
    if (item.prompt !== undefined && (typeof item.prompt !== "string" || !item.prompt.trim())) {
      throw new Error("绘图 Prompt 不能为空");
    }
    if (item.image !== undefined && !isGalleryImageReference(item.image)) {
      throw new Error("朋友圈图片引用无效");
    }
    return {
      type: "image",
      description: item.description.trim(),
      ...(item.prompt === undefined ? {} : { prompt: item.prompt.trim() }),
      ...(item.image === undefined ? {} : { image: galleryImageReference(item.image) }),
    };
  });
  if (!text && !media.length) {
    throw new Error("请填写正文或媒体描述");
  }
  return { text, media };
}

/** 发布页用它提前标出不能提交的位置，保存阶段仍由 normalizeMomentContent 做最终校验。 */
export type MomentDraftIssue =
  | { readonly kind: "empty" | "limit"; readonly message: string }
  | { readonly kind: "image" | "video"; readonly index: number; readonly message: string };

export function momentDraftIssue(content: MomentContent): MomentDraftIssue | null {
  if (content.media.length > 9) {
    return { kind: "limit", message: "图片和视频合计最多 9 个。" };
  }
  const index = content.media.findIndex((item) => !item.description.trim());
  if (index >= 0) {
    const kind = content.media[index]!.type;
    return {
      kind,
      index,
      message: `第 ${index + 1} 个媒体（${kind === "image" ? "图片" : "视频"}）需要填写描述。`,
    };
  }
  return content.text.trim() || content.media.length
    ? null
    : { kind: "empty", message: "写点什么，或添加图片、视频。" };
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
  const item = moment.media[index];
  if (!Number.isSafeInteger(index) || index < 0 || item?.type !== "image") {
    throw new Error("朋友圈图片位置无效");
  }
  return item;
}
