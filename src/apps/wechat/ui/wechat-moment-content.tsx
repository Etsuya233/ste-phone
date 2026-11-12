import { useGallery } from "../../../frontend/images/gallery-context.ts";
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
    ["running", "saving"].includes(state.momentGeneration.status) ||
    state.barrierSaving ||
    ["sending", "running", "saving"].includes(state.reply.status)
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
      <PersonAvatar path={person?.avatar?.imagePath} name={name} />
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
  showTime = true,
  onImage,
}: {
  moment: WechatMoment;
  compact?: boolean;
  showTime?: boolean;
  onImage?(index: number): void;
}) {
  const { imageUrl } = useGallery();
  const layout =
    moment.media.length === 1
      ? "single"
      : moment.media.length === 2 || moment.media.length === 4
        ? "two"
        : "grid";
  const fullTime = formatWechatMomentFullTime(moment.createdAt);
  return (
    <div className={`wechat-moment-content ${compact ? "wechat-moment-content--compact" : ""}`}>
      {moment.text ? <p className="wechat-moment-text">{moment.text}</p> : null}
      {moment.media.length ? (
        <div className={`wechat-moment-media ${compact ? `wechat-moment-media--${layout}` : ""}`}>
          {moment.media.map((item, index) => {
            const description = item.description;
            const image = item.type === "image" ? item.image : undefined;
            const placeholder = `wechat-moment-placeholder wechat-moment-placeholder--${
              image ? "photo" : "text"
            }`;
            const content = image ? (
              <>
                <img
                  className="wechat-moment-photo"
                  src={imageUrl(image.imagePath)}
                  alt={description}
                  loading="lazy"
                />
                {!compact ? <p>{description}</p> : null}
              </>
            ) : (
              <>
                <span>
                  {item.type === "video" ? "视频" : `图片 ${index + 1}/${moment.media.length}`}
                </span>
                <p>{description}</p>
              </>
            );
            return onImage && item.type === "image" ? (
              <button
                className={`${placeholder} wechat-moment-image-open`}
                type="button"
                key={index}
                onClick={() => onImage(index)}
                aria-label={`编辑图片 ${index + 1}`}
              >
                {content}
              </button>
            ) : (
              <div className={placeholder} key={index}>
                {content}
              </div>
            );
          })}
        </div>
      ) : null}
      {showTime ? (
        <time dateTime={moment.createdAt} title={fullTime}>
          {compact ? formatWechatMomentTime(moment.createdAt, new Date()) : fullTime}
        </time>
      ) : null}
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
      <div className="wechat-moment-comment-head">
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
      <p className="wechat-moment-comment-text">{comment.text}</p>
    </div>
  );
}
