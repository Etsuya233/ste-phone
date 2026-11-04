import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { ActionSheet } from "../../../frontend/foundation/action-sheet.tsx";
import type { MomentComment } from "../wechat-moments.ts";
import type { WechatPageProps } from "./wechat-page.tsx";
import { MomentAuthor, MomentContentView, momentWritingReason } from "./wechat-moment-content.tsx";
import { MomentCommentBar } from "./wechat-moment-comment-bar.tsx";
import { MomentCommentsSection } from "./wechat-moment-comments-section.tsx";

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
  const [menuOpen, setMenuOpen] = useState(false);
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
    menuOpen,
    setMenuOpen,
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
      // 内容容器铺满整页，顶部导航通过 padding 占位，定位时要把这段高度算进去。
      const style = getComputedStyle(scroller);
      const visibleTop = viewport.top + parseFloat(style.paddingTop);
      scroller.scrollTo({
        top: scroller.scrollTop + target.top - visibleTop - 12,
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
  const [commentBarHeight, setCommentBarHeight] = useState(60);
  const moment = state.data.moments?.[scopeId]?.find((item) => item.id === id);
  const reason = momentWritingReason(state, scopeId);
  const locked = !!reason || editor.status !== "editing";
  const candidates = state.people.filter((person) => person.id !== state.data.account?.id);
  const own = (personId: string) =>
    state.data.account?.scopeId === scopeId && state.data.account.id === personId;
  const showBar = !!moment && !reason;
  return (
    <>
      <div className="wechat-moment-page" inert={!!editor.confirmation || editor.menuOpen}>
        <Page
          navBar={
            <NavBar
              title="动态详情"
              back={{ label: "返回", onClick: editor.back }}
              right={
                moment && own(moment.author.id) ? (
                  <Button
                    aria-label="动态菜单"
                    disabled={locked}
                    onClick={() => editor.setMenuOpen(true)}
                  >
                    ···
                  </Button>
                ) : undefined
              }
            />
          }
          footer={
            showBar ? (
              <MomentCommentBar
                text={editor.text}
                replyTo={editor.replyTo}
                people={state.people}
                error={editor.error}
                status={editor.status}
                disabled={locked}
                onTextChange={editor.setText}
                onCancelReply={() => editor.setReplyTo(null)}
                onSubmit={() => void editor.comment()}
                onHeightChange={setCommentBarHeight}
              />
            ) : null
          }
          footerHeight={showBar ? commentBarHeight : 0}
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
              <MomentCommentsSection
                moment={moment}
                state={state}
                locked={locked}
                hasCandidates={candidates.length > 0}
                reason={reason}
                newCommentCount={reveal.newCommentCount}
                commentsRef={reveal.commentsRef}
                onReply={locked ? undefined : (comment) => editor.setReplyTo(comment)}
                canDelete={(comment) => !locked && own(comment.author.id)}
                onDelete={(comment) => editor.setConfirmation({ type: "comment", id: comment.id })}
                onInteract={() =>
                  navigation.push({
                    page: "moment-participants",
                    scopeId,
                    id,
                    onInteracted: reveal.revealComments,
                  })
                }
              />
            </>
          ) : (
            <p className="wechat-notice">动态已删除。</p>
          )}
        </Page>
      </div>
      {editor.menuOpen ? (
        <ActionSheet
          active={active}
          label="动态操作"
          actions={[
            {
              label: "删除动态",
              destructive: true,
              disabled: locked,
              onClick: () => editor.setConfirmation({ type: "moment" }),
            },
          ]}
          onDismiss={() => editor.setMenuOpen(false)}
        />
      ) : null}
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
