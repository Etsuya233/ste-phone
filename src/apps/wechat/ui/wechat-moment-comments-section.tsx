import type { RefObject } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { MomentComment, WechatMoment } from "../wechat-moments.ts";
import type { WechatSnapshot } from "../wechat.ts";
import { MomentCommentView } from "./wechat-moment-content.tsx";

/** 详情评论区；回复和删除权限由页面按当前帐号判定，这里只负责展示和触发。 */
export function MomentCommentsSection({
  moment,
  state,
  locked,
  hasCandidates,
  reason,
  newCommentCount,
  commentsRef,
  onReply,
  canDelete,
  onDelete,
  onInteract,
}: {
  moment: WechatMoment;
  state: WechatSnapshot;
  locked: boolean;
  hasCandidates: boolean;
  reason: string | null;
  newCommentCount: number;
  commentsRef: RefObject<HTMLElement | null>;
  onReply?: (comment: MomentComment) => void;
  canDelete(comment: MomentComment): boolean;
  onDelete?: (comment: MomentComment) => void;
  onInteract(): void;
}) {
  return (
    <section ref={commentsRef} className="wechat-moment-comments" aria-label="全部评论">
      <div className="wechat-moment-comments-head">
        <h2>评论 {moment.comments.length}</h2>
        <Button
          className="wechat-moment-ai-inline"
          disabled={locked || !hasCandidates}
          onClick={onInteract}
        >
          AI 生成互动
        </Button>
      </div>
      {reason ? <p className="wechat-notice">{reason}</p> : null}
      {!hasCandidates ? <p className="wechat-notice">没有可参与互动的其他人物。</p> : null}
      {newCommentCount ? (
        <p className="wechat-moment-new-comments" role="status">
          AI 新增了 {newCommentCount} 条评论
        </p>
      ) : null}
      {!moment.comments.length ? <p className="wechat-notice">还没有评论。</p> : null}
      {moment.comments.map((comment) => (
        <MomentCommentView
          key={comment.id}
          comment={comment}
          moment={moment}
          state={state}
          onReply={onReply ? () => onReply(comment) : undefined}
          onDelete={onDelete && canDelete(comment) ? () => onDelete(comment) : undefined}
        />
      ))}
    </section>
  );
}
