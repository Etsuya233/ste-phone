import { Button } from "../../../frontend/foundation/button.tsx";
import type { MomentComment, WechatMoment } from "../wechat-moments.ts";
import { formatWechatMomentFullTime, formatWechatMomentTime } from "../wechat-time.ts";
import type { WechatPerson, WechatSnapshot } from "../wechat.ts";
import { PersonAvatar, type WechatPageProps } from "./wechat-page.tsx";

export function momentWritingReason(state: WechatSnapshot, scopeId: string): string | null {
  if (state.loading) {
    return "正在载入朋友圈…";
  }
  if (state.error) {
    return `人物资料加载失败：${state.error}`;
  }
  if (state.scopeId !== scopeId) {
    return "正在查看历史资料的朋友圈，仅可阅读。";
  }
  if (
    !state.data.account ||
    state.data.account.scopeId !== scopeId ||
    !state.people.some((person) => person.id === state.data.account!.id)
  ) {
    return "请先选择当前资料中的微信帐号。";
  }
  if (
    state.writeBusy ||
    ["running", "saving", "stopping"].includes(state.momentGeneration.status) ||
    state.barrierSaving ||
    ["sending", "running", "saving", "stopping"].includes(state.reply.status)
  ) {
    return "请等待当前生成或保存完成。";
  }
  return null;
}

export function MomentAuthor({
  author,
  state,
  navigation,
}: { author: WechatPerson } & Pick<WechatPageProps, "state" | "navigation">) {
  const person =
    state.scopeId === author.scopeId
      ? state.people.find((item) => item.id === author.id)
      : undefined;
  const name = person?.name ?? author.name;
  return person ? (
    <button
      type="button"
      className="wechat-moment-author"
      onClick={() => navigation.push({ page: "person", id: person.id })}
    >
      <PersonAvatar name={name} />
      <strong>{name}</strong>
    </button>
  ) : (
    <span className="wechat-moment-author">
      <PersonAvatar name={name} />
      <strong>{name}</strong>
    </span>
  );
}

export function MomentContentView({
  moment,
  compact = false,
}: {
  moment: WechatMoment;
  compact?: boolean;
}) {
  const descriptions =
    moment.media.type === "images"
      ? moment.media.descriptions
      : moment.media.type === "video"
        ? [moment.media.description]
        : [];
  const layout =
    descriptions.length === 1
      ? "single"
      : descriptions.length === 2 || descriptions.length === 4
        ? "two"
        : "grid";
  const fullTime = formatWechatMomentFullTime(moment.createdAt);
  return (
    <div className={`wechat-moment-content ${compact ? "wechat-moment-content--compact" : ""}`}>
      {moment.text ? <p className="wechat-moment-text">{moment.text}</p> : null}
      {descriptions.length ? (
        <div
          className={`wechat-moment-media wechat-moment-media--${moment.media.type} ${
            compact ? `wechat-moment-media--${layout}` : ""
          }`}
        >
          {descriptions.map((description, index) => (
            <div className="wechat-moment-placeholder" key={index}>
              <span>
                {moment.media.type === "video"
                  ? "视频"
                  : descriptions.length > 1
                    ? `图片 ${index + 1}/${descriptions.length}`
                    : "图片"}
              </span>
              <p>{description}</p>
            </div>
          ))}
        </div>
      ) : null}
      <time dateTime={moment.createdAt} title={fullTime}>
        {compact ? formatWechatMomentTime(moment.createdAt, new Date()) : fullTime}
      </time>
    </div>
  );
}

export function MomentCommentView({
  comment,
  moment,
  state,
  onReply,
  onDelete,
}: {
  comment: MomentComment;
  moment: WechatMoment;
  state: WechatSnapshot;
  onReply?: () => void;
  onDelete?: () => void;
}) {
  const name = (person: WechatPerson) =>
    state.scopeId === person.scopeId
      ? (state.people.find((item) => item.id === person.id)?.name ?? person.name)
      : person.name;
  const deleted =
    comment.replyTo && !moment.comments.some((item) => item.id === comment.replyTo!.commentId);
  return (
    <div className="wechat-moment-comment" data-comment-id={comment.id}>
      <p className="wechat-moment-comment-meta">
        <strong>{name(comment.author)}</strong>
        {comment.replyTo ? (
          <span className="wechat-moment-reply-context">
            {" "}
            回复 <strong>{name(comment.replyTo.author)}</strong>
            {deleted ? <span className="wechat-moment-reply-deleted">原评论已删除</span> : null}
          </span>
        ) : null}
      </p>
      <p className="wechat-moment-comment-text">{comment.text}</p>
      {onReply || onDelete ? (
        <div className="wechat-moment-comment-actions">
          {onReply ? <Button onClick={onReply}>回复</Button> : null}
          {onDelete ? (
            <Button className="wechat-moment-delete" onClick={onDelete}>
              删除
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
