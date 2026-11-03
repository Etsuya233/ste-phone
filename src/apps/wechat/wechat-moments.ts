import type { WechatData, WechatPerson } from "./wechat.ts";

export type MomentMedia =
  | { readonly type: "none" }
  | { readonly type: "images"; readonly descriptions: readonly string[] }
  | { readonly type: "video"; readonly description: string };

export interface MomentContent {
  readonly text: string;
  readonly media: MomentMedia;
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

/** 媒体描述与正文均为纯文本；只去首尾空白，内部段落保持原样。 */
export function normalizeMomentContent(content: MomentContent): MomentContent {
  const text = content.text.trim();
  let media: MomentMedia;
  switch (content.media.type) {
    case "none":
      media = { type: "none" };
      break;
    case "images": {
      const descriptions = content.media.descriptions.map((description) => description.trim());
      if (
        descriptions.length < 1 ||
        descriptions.length > 9 ||
        descriptions.some((item) => !item)
      ) {
        throw new Error("图片需要 1—9 条非空描述");
      }
      media = { type: "images", descriptions };
      break;
    }
    case "video": {
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
