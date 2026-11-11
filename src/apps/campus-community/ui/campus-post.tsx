import { useRef, useState } from "react";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { createCampusId, type CampusComment, type CampusPost } from "../campus-domain.ts";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";
import { AccountLink, CampusPostCard } from "./campus-post-card.tsx";

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

export function CampusPostPage(props: CampusPageProps & { postId: string }) {
  const post = props.state.data.posts.find(({ id }) => id === props.postId);
  if (!post) {
    return (
      <CampusPage {...props} title="帖子" back={props.navigation.pop}>
        <p className="campus-section">帖子已删除。</p>
      </CampusPage>
    );
  }
  return <CampusDiscussion key={props.state.data.activeAccountId} {...props} post={post} />;
}

function CampusDiscussion(props: CampusPageProps & { post: CampusPost }) {
  const { service, state, navigation, post } = props;
  const [target, setTarget] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "post" } | { kind: "comment"; id: string } | null>(
    null,
  );
  const replyInput = useRef<HTMLInputElement>(null);
  const current = state.data.activeAccountId;
  const busy = state.phase !== "idle";
  const isOwner = current === post.authorId;
  const selected = post.comments.find(({ id }) => id === target);
  const replyName = selected
    ? state.data.accounts.find(({ id }) => id === selected.authorId)!.nickname
    : null;

  function reply(id: string) {
    setTarget(id);
    replyInput.current?.focus();
  }

  async function remove() {
    if (!confirm) {
      return;
    }
    const selection = confirm;
    setConfirm(null);
    const saved = await service.command(
      selection.kind === "post"
        ? { type: "delete-post", postId: post.id }
        : { type: "delete-comment", postId: post.id, commentId: selection.id },
    );
    if (saved && selection.kind === "post" && navigation.current) {
      navigation.pop();
    }
    if (saved && selection.kind === "comment" && target === selection.id) {
      setTarget(null);
    }
  }

  return (
    <>
      <div inert={Boolean(confirm)}>
        <CampusPage
          {...props}
          title="帖子"
          back={navigation.pop}
          footerHeight={selected ? 76 : 50}
          footer={
            current ? (
              <CampusReplyForm
                input={replyInput}
                replyName={replyName}
                busy={busy}
                onCancel={() => setTarget(null)}
                onSend={async (text) => {
                  const comment = {
                    id: createCampusId(),
                    authorId: current,
                    text,
                    replyTo: target,
                    deleted: false,
                  };
                  const saved = await service.command({
                    type: "comment",
                    postId: post.id,
                    comment,
                  });
                  if (saved) {
                    setTarget(null);
                  }
                  return saved;
                }}
              />
            ) : undefined
          }
        >
          <CampusPostCard {...props} detail />
          <section className="campus-section" aria-label="讨论">
            <CampusPostActions
              postId={post.id}
              navigation={navigation}
              busy={busy}
              isOwner={isOwner}
              onDelete={() => setConfirm({ kind: "post" })}
            />
            <CommentThreads
              post={post}
              state={state}
              navigation={navigation}
              onReply={reply}
              onRemove={(id) => setConfirm({ kind: "comment", id })}
            />
            {post.backgroundComments > 0 ? (
              <p className="campus-meta">
                还有 {post.backgroundComments.toLocaleString("zh-CN")} 条评论未加载
              </p>
            ) : null}
          </section>
        </CampusPage>
      </div>
      {confirm ? (
        <Alert
          title={confirm.kind === "post" ? "删除帖子？" : "删除评论？"}
          active={navigation.current}
          onDismiss={() => setConfirm(null)}
          actions={[
            { label: "取消", onClick: () => setConfirm(null) },
            { label: "删除", onClick: () => void remove(), primary: true },
          ]}
        >
          {confirm.kind === "post"
            ? "帖子、点赞与讨论将移除，配图仍保存在图库。"
            : "已有回复会保留。"}
        </Alert>
      ) : null}
    </>
  );
}

function CampusPostActions({
  postId,
  navigation,
  busy,
  isOwner,
  onDelete,
}: {
  postId: string;
  navigation: CampusPageProps["navigation"];
  busy: boolean;
  isOwner: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="campus-row campus-actions">
      <Button
        variant="filled"
        disabled={busy}
        onClick={() => navigation.push({ page: "generate", postId })}
      >
        生成本帖互动
      </Button>
      <Button disabled={busy} onClick={() => navigation.push({ page: "heat", postId })}>
        调整热度
      </Button>
      {isOwner ? (
        <Button variant="danger" disabled={busy} onClick={onDelete}>
          删除帖子
        </Button>
      ) : null}
    </div>
  );
}

function CampusReplyForm({
  input,
  replyName,
  busy,
  onCancel,
  onSend,
}: {
  input: React.RefObject<HTMLInputElement | null>;
  replyName: string | null;
  busy: boolean;
  onCancel: () => void;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  return (
    <form
      className="campus-reply"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!busy && text.trim() && (await onSend(text.trim()))) {
          setText("");
        }
      }}
    >
      {replyName ? (
        <div className="campus-row">
          <span className="campus-meta">回复 {replyName}</span>
          <Button disabled={busy} onClick={onCancel}>
            取消回复
          </Button>
        </div>
      ) : null}
      <div className="campus-row">
        <input
          ref={input}
          aria-label="评论正文"
          placeholder="写一条评论…"
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
        />
        <Button type="submit" disabled={busy || !text.trim()}>
          发送
        </Button>
      </div>
    </form>
  );
}

function CommentThreads({
  post,
  state,
  navigation,
  onReply,
  onRemove,
}: Pick<CampusPageProps, "state" | "navigation"> & {
  post: CampusPost;
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
    if (comment.deleted) {
      return <p className="campus-meta">原评论已删除</p>;
    }
    return (
      <>
        <AccountLink
          account={author}
          onClick={() => navigation.push({ page: "profile", accountId: author.id })}
        />
        {target ? (
          <p className="campus-meta">
            {target.deleted
              ? "回复的评论已删除"
              : `回复 ${accounts.get(target.authorId)!.nickname}`}
          </p>
        ) : null}
        <p>{comment.text}</p>
        {current ? (
          <Button disabled={busy} onClick={() => onReply(comment.id)}>
            回复
          </Button>
        ) : null}
        {current === author.id ? (
          <Button variant="danger" disabled={busy} onClick={() => onRemove(comment.id)}>
            删除
          </Button>
        ) : null}
      </>
    );
  }
  const threads = groupComments(post.comments);
  return threads.length ? (
    <ol className="campus-comments">
      {threads.map(({ root, replies }) => (
        <li key={root.id} className="campus-comment">
          {renderComment(root)}
          {replies.some(({ deleted }) => !deleted) ? (
            <ol className="campus-thread">
              {replies
                .filter(({ deleted }) => !deleted)
                .map((reply) => (
                  <li className="campus-comment" key={reply.id}>
                    {renderComment(reply)}
                  </li>
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
