import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import type { MomentComment } from "../wechat-moments.ts";
import type { WechatPageProps } from "./wechat-page.tsx";
import {
  MomentAuthor,
  MomentCommentView,
  MomentContentView,
  momentWritingReason,
} from "./wechat-moment-content.tsx";

type Confirmation = { type: "discard" | "moment" } | { type: "comment"; id: string } | null;

function useMomentDetail({
  wechat,
  navigation,
  active,
  id,
}: WechatPageProps & { active: boolean; id: string }) {
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<MomentComment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"editing" | "saving" | "deleted">("editing");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  useEffect(() => {
    if (active && status === "deleted") {
      navigation.pop();
    }
  }, [active, status, navigation]);
  async function comment() {
    setStatus("saving");
    setError(null);
    try {
      await wechat.moments.comment(id, text, replyTo?.id);
      setText("");
      setReplyTo(null);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setStatus("editing");
    }
  }
  async function confirm() {
    const action = confirmation;
    setConfirmation(null);
    if (action?.type === "discard") {
      navigation.pop();
      return;
    }
    setStatus("saving");
    setError(null);
    try {
      if (action?.type === "moment") {
        await wechat.moments.deleteMoment(id);
      } else if (action?.type === "comment") {
        await wechat.moments.deleteComment(id, action.id);
      }
      setStatus(action?.type === "moment" ? "deleted" : "editing");
    } catch (error) {
      setError((error as Error).message);
      setStatus("editing");
    }
  }
  function back() {
    if (status !== "editing") {
      return;
    }
    if (text || replyTo) {
      setConfirmation({ type: "discard" });
    } else {
      navigation.pop();
    }
  }
  return {
    text,
    setText,
    replyTo,
    setReplyTo,
    error,
    status,
    confirmation,
    setConfirmation,
    comment,
    confirm,
    back,
  };
}

function useRevealComments(active: boolean) {
  const commentsRef = useRef<HTMLElement>(null);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [newCommentCount, setNewCommentCount] = useState(0);
  useLayoutEffect(() => {
    if (!active || pendingCount === null) {
      return;
    }
    setPendingCount(null);
    setNewCommentCount(pendingCount);
    if (pendingCount <= 0) {
      return;
    }
    // 等新增提示渲染后再定位，避免提示自身高度把目标挤出视口。
    requestAnimationFrame(() => {
      const section = commentsRef.current;
      const scroller = section?.closest<HTMLElement>(".ios-page-content");
      if (!section || !scroller) {
        return;
      }
      const comments = section.querySelectorAll<HTMLElement>("[data-comment-id]");
      const firstNew = comments[comments.length - pendingCount];
      if (!firstNew) {
        return;
      }
      const target = firstNew.getBoundingClientRect();
      const viewport = scroller.getBoundingClientRect();
      scroller.scrollTo({
        top: scroller.scrollTop + target.top - viewport.top - 12,
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
  }, [active, pendingCount]);
  return {
    commentsRef,
    newCommentCount,
    revealComments: (count: number) => setPendingCount(count),
  };
}

export function WechatMomentDetail(
  props: WechatPageProps & { id: string; scopeId: string; active: boolean },
) {
  const { state, navigation, id, scopeId, active } = props;
  const editor = useMomentDetail(props);
  const reveal = useRevealComments(active);
  const moment = state.data.moments?.[scopeId]?.find((item) => item.id === id);
  const reason = momentWritingReason(state, scopeId);
  const locked = !!reason || editor.status !== "editing";
  const own = (personId: string) =>
    state.data.account?.scopeId === scopeId && state.data.account.id === personId;
  return (
    <>
      <div className="wechat-moment-page" inert={!!editor.confirmation}>
        <Page
          navBar={
            <NavBar
              title="动态详情"
              back={{ label: "朋友圈", onClick: editor.back }}
              right={
                moment && own(moment.author.id) ? (
                  <Button
                    variant="danger"
                    disabled={locked}
                    onClick={() => editor.setConfirmation({ type: "moment" })}
                  >
                    删除动态
                  </Button>
                ) : undefined
              }
            />
          }
        >
          {moment ? (
            <>
              <article className="wechat-moment">
                <MomentAuthor author={moment.author} state={state} navigation={navigation} />
                <MomentContentView
                  moment={moment}
                  onImage={(index) => navigation.push({ page: "moment-image", scopeId, id, index })}
                />
              </article>
              <div className="wechat-moment-ai-actions">
                <Button
                  disabled={
                    locked || !state.people.some((person) => person.id !== state.data.account?.id)
                  }
                  onClick={() =>
                    navigation.push({
                      page: "moment-participants",
                      scopeId,
                      id,
                      onInteracted: reveal.revealComments,
                    })
                  }
                >
                  AI 生成互动
                </Button>
                {!state.people.some((person) => person.id !== state.data.account?.id) ? (
                  <p className="wechat-notice">没有可参与互动的其他人物。</p>
                ) : null}
              </div>
              <section
                ref={reveal.commentsRef}
                className="wechat-moment-comments"
                aria-label="全部评论"
              >
                <h2>评论 {moment.comments.length}</h2>
                {reveal.newCommentCount ? (
                  <p className="wechat-moment-new-comments" role="status">
                    AI 新增了 {reveal.newCommentCount} 条评论
                  </p>
                ) : null}
                {!moment.comments.length ? <p className="wechat-notice">还没有评论。</p> : null}
                {moment.comments.map((comment) => (
                  <MomentCommentView
                    key={comment.id}
                    comment={comment}
                    moment={moment}
                    state={state}
                    onReply={locked ? undefined : () => editor.setReplyTo(comment)}
                    onDelete={
                      !locked && own(comment.author.id)
                        ? () => editor.setConfirmation({ type: "comment", id: comment.id })
                        : undefined
                    }
                  />
                ))}
              </section>
              <MomentCommentEditor editor={editor} state={state} reason={reason} locked={locked} />
            </>
          ) : (
            <p className="wechat-notice">动态已删除。</p>
          )}
        </Page>
      </div>
      <MomentConfirmation editor={editor} active={active} />
    </>
  );
}

function MomentConfirmation({
  editor,
  active,
}: {
  editor: ReturnType<typeof useMomentDetail>;
  active: boolean;
}) {
  const confirmation = editor.confirmation;
  if (!confirmation) {
    return null;
  }
  return (
    <Alert
      active={active}
      title={
        confirmation.type === "discard"
          ? "舍弃评论？"
          : confirmation.type === "moment"
            ? "删除动态？"
            : "删除评论？"
      }
      onDismiss={() => editor.setConfirmation(null)}
      actions={[
        {
          label: confirmation.type === "discard" ? "继续编辑" : "取消",
          onClick: () => editor.setConfirmation(null),
        },
        {
          label: confirmation.type === "discard" ? "舍弃" : "删除",
          onClick: () => void editor.confirm(),
        },
      ]}
    >
      {confirmation.type === "moment"
        ? "动态及其全部评论将被删除。"
        : confirmation.type === "comment"
          ? "原评论将被删除，其他人的回复会保留。"
          : "未提交的评论将被舍弃。"}
    </Alert>
  );
}

function MomentCommentEditor({
  editor,
  state,
  reason,
  locked,
}: {
  editor: ReturnType<typeof useMomentDetail>;
  state: WechatPageProps["state"];
  reason: string | null;
  locked: boolean;
}) {
  return (
    <div className="wechat-moment-editor">
      {reason ? <p className="wechat-notice">{reason}</p> : null}
      {editor.replyTo ? (
        <div className="wechat-moment-reply-target">
          <span>
            回复
            {state.people.find((person) => person.id === editor.replyTo!.author.id)?.name ??
              editor.replyTo.author.name}
          </span>
          <Button onClick={() => editor.setReplyTo(null)}>取消回复</Button>
        </div>
      ) : null}
      <label className="wechat-moment-label">
        {editor.replyTo ? "回复内容" : "评论内容"}
        <textarea
          rows={3}
          value={editor.text}
          onChange={(event) => editor.setText(event.target.value)}
          disabled={editor.status !== "editing"}
        />
      </label>
      <Button
        variant="filled"
        className="wechat-moment-primary"
        disabled={locked || !editor.text.trim()}
        onClick={() => void editor.comment()}
      >
        {editor.status === "saving" ? "保存中" : "提交评论"}
      </Button>
      {editor.error ? (
        <p className="wechat-notice" role="alert">
          {editor.error}
        </p>
      ) : null}
    </div>
  );
}
