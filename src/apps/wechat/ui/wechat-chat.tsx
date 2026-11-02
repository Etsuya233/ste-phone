import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";
import { WechatComposer } from "./wechat-composer.tsx";
import { conversationId } from "../wechat.ts";
import { WechatMessages } from "./wechat-messages.tsx";

export function WechatChat({
  wechat,
  state,
  navigation,
  id,
  active,
  stickers,
  stickerState,
  sendMode,
}: WechatPageProps & { id: string; active: boolean }) {
  const [draft, setDraft] = useState(() => wechat.getDraft(id));
  const [composerHeight, setComposerHeight] = useState(62);
  const end = useRef<HTMLDivElement>(null);
  const conversation = wechat.getConversation(id);
  const person = state.people.find((person) => person.id === id);
  const other = conversation?.people.find((person) => person.id === id);
  const name = person?.name ?? other?.name ?? "人物不可用";
  const currentId = state.data.account
    ? conversationId(state.data.account.scopeId, state.data.account.id, id)
    : null;
  const reply =
    state.reply.status !== "idle" && state.reply.conversationId === currentId ? state.reply : null;
  const running = state.reply.status === "running" || state.reply.status === "saving";
  const stopping = state.reply.status === "stopping";
  const sending = state.reply.status === "sending";
  const available = !!person && !!state.data.account && !state.error && !state.loading;
  useMessageScroll(end, conversation?.messages.length, active, composerHeight);
  async function submit(action: "send" | "enqueue") {
    const text = draft;
    setDraft("");
    // 保存失败时服务会恢复草稿，这里同步恢复输入框，避免消息被撤回后正文也丢失。
    if (!(await wechat[action](id, text))) {
      setDraft((current) => current || wechat.getDraft(id));
    }
  }
  return (
    <Page
      className="wechat-chat"
      navBar={
        <NavBar
          title={
            reply?.status === "running" || reply?.status === "saving" ? "用户正在输入..." : name
          }
          back={{ label: "微信", onClick: navigation.pop }}
          right={<Button onClick={() => navigation.push({ page: "person", id })}>资料</Button>}
        />
      }
      footerHeight={composerHeight}
      footer={
        <WechatComposer
          value={draft}
          disabled={!available || running || sending || stopping}
          replying={!!reply && running}
          onStop={() => wechat.cancel()}
          delayed={sendMode === "delayed"}
          onQueue={() => void submit("enqueue")}
          onChange={(text) => {
            setDraft(text);
            wechat.setDraft(id, text);
          }}
          onSend={() => void submit("send")}
          onHeightChange={setComposerHeight}
          packs={stickerState.packs}
          stickers={stickers}
          onSendSticker={(marker) =>
            void wechat[sendMode === "delayed" ? "enqueue" : "send"](id, marker, {
              preserveDraft: true,
            })
          }
          onManageStickers={() => navigation.push({ page: "stickers" })}
        />
      }
    >
      <WechatMessages
        conversation={conversation}
        accountId={state.data.account?.id}
        people={state.people}
        packs={stickerState.packs}
        stickers={stickers}
      />
      {!available && (
        <p className="wechat-notice">{state.error ?? "当前人物资料不可用，仍可阅读历史。"}</p>
      )}
      {reply?.status === "error" && (
        <div className="wechat-reply" role="alert">
          <p>{reply.error}</p>
          {reply.retry && (
            <Button disabled={!available} onClick={() => void wechat.requestReply(id)}>
              重试回复
            </Button>
          )}
        </div>
      )}
      <div ref={end} />
    </Page>
  );
}

/** 用户向上阅读时保留位置，仅在靠近底部时自动跟随新消息。 */
function useMessageScroll(
  end: RefObject<HTMLDivElement | null>,
  count: number | undefined,
  active: boolean,
  composerHeight: number,
) {
  const follow = useRef(true);
  useEffect(() => {
    const content = end.current?.closest(".ios-page-content");
    if (!content || !active) {
      return;
    }
    if (follow.current) {
      content.scrollTop = content.scrollHeight;
    }
    const scroll = () => {
      follow.current = content.scrollHeight - content.scrollTop - content.clientHeight < 60;
    };
    content.addEventListener("scroll", scroll);
    return () => content.removeEventListener("scroll", scroll);
  }, [count, active, composerHeight, end]);
}
