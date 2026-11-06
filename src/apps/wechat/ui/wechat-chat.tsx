import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";
import { WechatChatComposer } from "./wechat-chat-composer.tsx";
import { conversationId } from "../wechat.ts";
import { useWechatMemory } from "./use-wechat-memory.tsx";
import { WechatMessages } from "./wechat-messages.tsx";

export function WechatChat({ ...props }: WechatPageProps & { id: string; active: boolean }) {
  const { wechat, state, navigation, id, active, stickers, stickerState } = props;
  const [composerHeight, setComposerHeight] = useState(62);
  const end = useRef<HTMLDivElement>(null);
  const conversation = wechat.getConversation(id);
  const memory = useWechatMemory({ ...props, conversation, end });
  const person = state.people.find((person) => person.id === id);
  const other = conversation?.people.find((person) => person.id === id);
  const name = person?.name ?? other?.name ?? "人物不可用";
  const currentId = state.data.account
    ? conversationId(state.data.account.scopeId, state.data.account.id, id)
    : null;
  const reply =
    state.reply.status !== "idle" && state.reply.conversationId === currentId ? state.reply : null;
  const available =
    !!person && !!state.data.account && !state.error && !state.loading && !memory.error;
  useMessageScroll(end, conversation?.messages.length, active, composerHeight);
  return (
    <>
      <Page
        inert={memory.menuOpen}
        className="wechat-chat"
        navBar={
          <NavBar
            title={
              reply?.status === "running"
                ? "用户正在输入..."
                : reply?.status === "saving"
                  ? "正在保存回复…"
                  : name
            }
            back={{ label: "微信", onClick: navigation.pop }}
            right={
              <Button aria-label="聊天菜单" onClick={memory.openChat}>
                ···
              </Button>
            }
          />
        }
        footerHeight={composerHeight}
        footer={
          <WechatChatComposer {...props} available={available} onHeightChange={setComposerHeight} />
        }
      >
        <WechatMessages
          memory={memory}
          active={active}
          conversation={conversation}
          accountId={state.data.account?.id}
          people={state.people}
          packs={stickerState.packs}
          stickers={stickers}
        />
        {!available && (
          <p className="wechat-notice">
            {memory.error ?? state.error ?? "当前人物资料不可用，仍可阅读历史。"}
          </p>
        )}
        {reply?.status === "error" && (
          <div className="wechat-reply" role="alert">
            <p>{reply.error}</p>
            {reply.retry && (
              <Button
                disabled={
                  !available ||
                  state.barrierSaving ||
                  state.writeBusy ||
                  ["running", "saving"].includes(state.momentGeneration.status)
                }
                onClick={() => void wechat.requestReply(id)}
              >
                重试回复
              </Button>
            )}
          </div>
        )}
        <div ref={end} />
      </Page>
      {memory.sheet}
    </>
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
