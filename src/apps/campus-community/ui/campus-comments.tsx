import { Button } from "../../../frontend/foundation/button.tsx";
import type { CampusComment, CampusPost } from "../campus-domain.ts";
import { formatCampusTime } from "../campus-display.ts";
import { AccountAvatar, AccountName } from "./campus-avatar.tsx";
import type { CampusPageProps } from "./campus-page.tsx";

function groupComments(comments: CampusComment[]) {
  const threads: { root: CampusComment; replies: CampusComment[] }[] = [];
  const byCommentId = new Map<string, (typeof threads)[number]>();
  // Every reply points to an earlier saved comment. Deleted comments keep their IDs and position.
  for (const comment of comments) {
    if (comment.replyTo === null) {
      const thread = { root: comment, replies: [] };
      threads.push(thread);
      byCommentId.set(comment.id, thread);
    } else {
      const thread = byCommentId.get(comment.replyTo)!;
      thread.replies.push(comment);
      byCommentId.set(comment.id, thread);
    }
  }
  return threads.filter(
    ({ root, replies }) => !root.deleted || replies.some(({ deleted }) => !deleted),
  );
}

export function CampusComments({
  post,
  state,
  navigation,
  now,
  highlightCommentId,
  onReply,
  onRemove,
}: Pick<CampusPageProps, "state" | "navigation"> & {
  post: CampusPost;
  now: Date;
  highlightCommentId: string | null;
  onReply: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const byId = new Map(post.comments.map((comment) => [comment.id, comment]));
  const accounts = new Map(state.data.accounts.map((account) => [account.id, account]));
  const current = state.data.activeAccountId;
  const busy = state.phase !== "idle";

  function renderComment(comment: CampusComment) {
    const author = accounts.get(comment.authorId)!;
    const target = comment.replyTo === null ? null : byId.get(comment.replyTo)!;
    const className = `campus-comment${highlightCommentId === comment.id ? " campus-comment--highlight" : ""}`;
    if (comment.deleted) {
      return (
        <div className={className} data-comment-id={comment.id}>
          <AccountAvatar account={author} size="small" />
          <p className="campus-meta">原评论已删除</p>
        </div>
      );
    }
    return (
      <div className={className} data-comment-id={comment.id}>
        <AccountAvatar account={author} size="small" />
        <div className="campus-comment-body">
          <div className="campus-comment-heading">
            <AccountName
              account={author}
              onClick={() => navigation.push({ page: "profile", accountId: author.id })}
            />
            {comment.createdAt ? (
              <time dateTime={new Date(comment.createdAt).toISOString()}>
                {formatCampusTime(comment.createdAt, now)}
              </time>
            ) : null}
          </div>
          {target ? (
            <p className="campus-meta">
              {target.deleted
                ? "回复的评论已删除"
                : `回复 ${accounts.get(target.authorId)!.nickname}`}
            </p>
          ) : null}
          <p>{comment.text}</p>
          <div className="campus-comment-actions">
            {current ? (
              <Button
                className="campus-comment-action"
                disabled={busy}
                onClick={() => onReply(comment.id)}
              >
                回复
              </Button>
            ) : null}
            {current === author.id ? (
              <Button
                className="campus-comment-action campus-comment-delete"
                disabled={busy}
                onClick={() => onRemove(comment.id)}
              >
                删除
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const threads = groupComments(post.comments);
  return threads.length ? (
    <ol className="campus-comments">
      {threads.map(({ root, replies }) => (
        <li key={root.id} className="campus-comment-thread">
          {renderComment(root)}
          {replies.some(({ deleted }) => !deleted) ? (
            <ol className="campus-thread">
              {replies
                .filter(({ deleted }) => !deleted)
                .map((reply) => (
                  <li key={reply.id}>{renderComment(reply)}</li>
                ))}
            </ol>
          ) : null}
        </li>
      ))}
    </ol>
  ) : (
    <p className="campus-meta">还没有实际评论。</p>
  );
}
