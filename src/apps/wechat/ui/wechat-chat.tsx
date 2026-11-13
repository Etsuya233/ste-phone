import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";
import { WechatChatComposer } from "./wechat-chat-composer.tsx";
import { conversationId, type WechatConversation } from "../wechat.ts";
import { useWechatMemory } from "./use-wechat-memory.tsx";
import { WechatMessages } from "./wechat-messages.tsx";
import { wechatChatWriteBusy } from "./wechat-chat-writing.ts";

type ChatProps = WechatPageProps & { id: string; active: boolean };

export function WechatChat(props: ChatProps) {
  const { wechat, state, id } = props;
  const conversation = wechat.getConversation(id);
  const person = state.people.find((person) => person.id === id);
  const saved = conversation?.people.find((person) => person.id === id);
  const account = state.data.account;
  return (
    <WechatChatTimeline
      {...props}
      conversation={conversation}
      name={person?.name ?? saved?.name ?? "人物不可用"}
      currentId={account ? conversationId(account.scopeId, account.id, id) : null}
      canSend={!!person && !!account}
    />
  );
}

export function WechatChatTimeline({
  conversation,
  name,
  currentId,
  canSend,
  ...props
}: ChatProps & {
  conversation?: WechatConversation;
  name: string;
  currentId: string | null;
  canSend: boolean;
}) {
  const { wechat, state, navigation, id, active, stickers, stickerState } = props;
  const [composerHeight, setComposerHeight] = useState(62);
  const [draft, setDraft] = useState(() => wechat.getDraft(id));
  useEffect(() => {
    // 指定发言页也可提交草稿，回到当前聊天时同步保存结果。
    if (active) {
      setDraft(wechat.getDraft(id));
    }
  }, [active, id, wechat]);
  const end = useRef<HTMLDivElement>(null);
  const memory = useWechatMemory({ ...props, conversation, end });
  const reply =
    state.reply.status !== "idle" && state.reply.conversationId === currentId ? state.reply : null;
  const available = canSend && !state.error && !state.loading && !memory.error;
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
          <WechatChatComposer
            {...props}
            available={available}
            currentId={currentId}
            group={conversation?.kind === "group"}
            draft={draft}
            setDraft={setDraft}
            onHeightChange={setComposerHeight}
          />
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
          onMention={(sender) => {
            const text = `${wechat.getDraft(id)}@${sender}`;
            setDraft(text);
            wechat.setDraft(id, text);
          }}
          onOpenImage={(messageId) => navigation.push({ page: "chat-image", id, messageId })}
          onOpenPayment={(messageId) => navigation.push({ page: "chat-payment", id, messageId })}
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
                disabled={!available || wechatChatWriteBusy(state)}
                onClick={() => void wechat.retryReply(id)}
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
