import { useEffect, useRef, useState } from "react";
import { ActionSheet } from "../../../frontend/foundation/action-sheet.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { createCampusId, type CampusPost } from "../campus-domain.ts";
import { formatCampusCount } from "../campus-display.ts";
import { CampusComments } from "./campus-comments.tsx";
import { MoreIcon, SparkleIcon } from "./campus-icons.tsx";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";
import { CampusPostCard } from "./campus-post-card.tsx";
import { CampusReplyForm } from "./campus-reply-form.tsx";
import { useCampusClock } from "./use-campus-clock.ts";

export function CampusPostPage(props: CampusPageProps & { postId: string }) {
  const post = props.state.data.posts.find(({ id }) => id === props.postId);
  const now = useCampusClock(props.active);
  if (!post) {
    return (
      <CampusPage {...props} title="帖子" back={props.navigation.pop}>
        <p className="campus-section">帖子已删除。</p>
      </CampusPage>
    );
  }
  return <CampusDiscussion {...props} post={post} now={now} />;
}

function CampusDiscussion(props: CampusPageProps & { post: CampusPost; now: Date }) {
  const { service, state, navigation, post, now } = props;
  const [target, setTarget] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "post" } | { kind: "comment"; id: string } | null>(
    null,
  );
  const [menu, setMenu] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const comments = useRef<HTMLElement>(null);
  const replyInput = useRef<HTMLInputElement>(null);
  const current = state.data.activeAccountId;
  const busy = state.phase !== "idle";
  const isOwner = current === post.authorId;
  const selected = post.comments.find(({ id }) => id === target);
  const replyName = selected
    ? state.data.accounts.find(({ id }) => id === selected.authorId)!.nickname
    : null;
  const commentCount =
    post.backgroundComments + post.comments.filter(({ deleted }) => !deleted).length;
  const savedBatchId = state.lastSaved?.batchId;
  const revealedBatchId = state.revealedBatchId;

  useEffect(() => {
    const saved = state.lastSaved;
    if (
      !navigation.current ||
      !saved ||
      saved.batchId === revealedBatchId ||
      saved.targetPostId !== post.id ||
      !saved.commentIds.length
    ) {
      return;
    }
    const first = saved.commentIds[0]!;
    setHighlight(first);
    const frame = requestAnimationFrame(() => {
      const element = comments.current?.querySelector<HTMLElement>(`[data-comment-id="${first}"]`);
      element?.scrollIntoView({ block: "start" });
      service.markSavedRevealed(saved.batchId);
    });
    return () => cancelAnimationFrame(frame);
    // 同一条批次只定位一次；快照里的其他字段变化不重复触发。
  }, [savedBatchId, revealedBatchId, post.id, navigation.current]);
  useEffect(() => {
    if (!highlight) {
      return;
    }
    const timer = setTimeout(() => setHighlight(null), 2400);
    return () => clearTimeout(timer);
  }, [highlight]);

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
      <div inert={Boolean(confirm) || menu}>
        <CampusPage
          {...props}
          title="帖子"
          back={navigation.pop}
          footerHeight={selected ? 78 : 50}
          right={
            <Button aria-label="帖子操作" onClick={() => setMenu(true)}>
              <span className="campus-button-icon">
                <MoreIcon />
              </span>
            </Button>
          }
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
          <CampusPostCard {...props} detail post={post} now={now} />
          <section className="campus-section campus-discussion" aria-label="讨论" ref={comments}>
            <div className="campus-comments-heading">
              <h2>评论 {formatCampusCount(commentCount)}</h2>
              <Button
                className="campus-ai-button"
                disabled={busy}
                onClick={() => navigation.push({ page: "generate", postId: post.id })}
              >
                <span className="campus-button-icon">
                  <SparkleIcon />
                </span>
                生成评论
              </Button>
            </div>
            {post.backgroundComments > 0 ? (
              <p className="campus-meta">
                还有 {post.backgroundComments.toLocaleString("zh-CN")} 条评论未加载
              </p>
            ) : null}
            <CampusComments
              post={post}
              state={state}
              navigation={navigation}
              now={now}
              highlightCommentId={highlight}
              onReply={reply}
              onRemove={(id) => setConfirm({ kind: "comment", id })}
            />
          </section>
        </CampusPage>
      </div>
      {menu ? (
        <ActionSheet
          active={navigation.current}
          onDismiss={() => setMenu(false)}
          actions={[
            {
              label: "生成本帖互动",
              disabled: busy,
              onClick: () => navigation.push({ page: "generate", postId: post.id }),
            },
            {
              label: "调整背景热度",
              disabled: busy,
              onClick: () => navigation.push({ page: "heat", postId: post.id }),
            },
            ...(isOwner
              ? [
                  {
                    label: "删除帖子",
                    destructive: true,
                    disabled: busy,
                    onClick: () => setConfirm({ kind: "post" }),
                  },
                ]
              : []),
          ]}
        />
      ) : null}
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
