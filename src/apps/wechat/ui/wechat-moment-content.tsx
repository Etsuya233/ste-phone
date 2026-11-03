import { Button } from "../../../frontend/foundation/button.tsx";
import type { MomentComment, WechatMoment } from "../wechat-moments.ts";
import type { WechatPerson, WechatSnapshot } from "../wechat.ts";
import { PersonAvatar, type WechatPageProps } from "./wechat-page.tsx";

export function momentWritingReason(state: WechatSnapshot, scopeId: string): string | null {
  if (state.loading || state.error || state.scopeId !== scopeId) {
    return "人物资料不可用，当前仅可阅读。";
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
  return (
    <div className={`wechat-moment-content ${compact ? "wechat-moment-content--compact" : ""}`}>
      {moment.text ? <p>{moment.text}</p> : null}
      {descriptions.length ? (
        <div
          className={`wechat-moment-media wechat-moment-media--${descriptions.length === 1 ? "single" : "grid"}`}
        >
          {descriptions.map((description, index) => (
            <div className="wechat-moment-placeholder" key={index}>
              <span>{moment.media.type === "video" ? "视频" : `图片 ${index + 1}`}</span>
              <p>{description}</p>
            </div>
          ))}
        </div>
      ) : null}
      <time dateTime={moment.createdAt}>{new Date(moment.createdAt).toLocaleString("zh-CN")}</time>
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
    <div className="wechat-moment-comment">
      <p>
        <strong>{name(comment.author)}</strong>
        {comment.replyTo ? (
          <>
            {" "}
            回复 <strong>{name(comment.replyTo.author)}</strong>
            {deleted ? "（原评论已删除）" : ""}
          </>
        ) : null}
        ：{comment.text}
      </p>
      {onReply || onDelete ? (
        <div className="wechat-moment-comment-actions">
          {onReply ? <Button onClick={onReply}>回复</Button> : null}
          {onDelete ? <Button onClick={onDelete}>删除评论</Button> : null}
        </div>
      ) : null}
    </div>
  );
}
