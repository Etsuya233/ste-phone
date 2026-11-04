import { Button } from "../../../frontend/foundation/button.tsx";
import type { WechatMoment } from "../wechat-moments.ts";
import type { WechatSnapshot } from "../wechat.ts";
import { formatWechatMomentFullTime, formatWechatMomentTime } from "../wechat-time.ts";
import type { WechatPageProps } from "./wechat-page.tsx";
import { MomentAuthor, MomentCommentView, MomentContentView } from "./wechat-moment-content.tsx";

/** 信息流卡片只消费已保存动态；正文、媒体和时间对齐作者名下，评论面板收在操作行之后。 */
export function MomentCard({
  moment,
  state,
  navigation,
  onOpen,
}: {
  moment: WechatMoment;
  state: WechatSnapshot;
  navigation: WechatPageProps["navigation"];
  onOpen(): void;
}) {
  const comments = moment.comments.slice(-3);
  return (
    <article className="wechat-moment">
      <MomentAuthor author={moment.author} state={state} navigation={navigation} />
      <button
        type="button"
        className="wechat-moment-open"
        aria-label={`查看动态：${moment.text || "媒体分享"}`}
        onClick={onOpen}
      >
        <MomentContentView moment={moment} compact showTime={false} />
      </button>
      <div className="wechat-moment-meta-row">
        <time dateTime={moment.createdAt} title={formatWechatMomentFullTime(moment.createdAt)}>
          {formatWechatMomentTime(moment.createdAt, new Date())}
        </time>
        <Button
          className="wechat-moment-more"
          aria-label={
            moment.comments.length
              ? `查看全部 ${moment.comments.length} 条评论`
              : "查看动态并发表评论"
          }
          onClick={onOpen}
        >
          {moment.comments.length ? `评论 ${moment.comments.length}` : "评论"}
        </Button>
      </div>
      {comments.length ? (
        <div className="wechat-moment-comment-panel">
          {comments.map((comment) => (
            <MomentCommentView key={comment.id} moment={moment} comment={comment} state={state} />
          ))}
        </div>
      ) : null}
    </article>
  );
}
