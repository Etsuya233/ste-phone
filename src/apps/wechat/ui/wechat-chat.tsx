import { useEffect, useRef, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { PersonAvatar, type WechatPageProps } from "./wechat-page.tsx";
import { conversationId } from "../wechat.ts";

export function WechatChat({
  wechat,
  state,
  navigation,
  id,
  active,
}: WechatPageProps & { id: string; active: boolean }) {
  const [draft, setDraft] = useState(() => wechat.getDraft(id));
  const end = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const conversation = wechat.getConversation(id);
  const person = state.people.find((person) => person.id === id);
  const other = conversation?.people.find((person) => person.id === id);
  const name = person?.name ?? other?.name ?? "人物不可用";
  const currentId = state.data.account
    ? conversationId(state.data.account.scopeId, state.data.account.id, id)
    : null;
  const reply =
    state.reply.status !== "idle" && state.reply.conversationId === currentId ? state.reply : null;
  const running = state.reply.status === "running";
  const available = !!person && !!state.data.account && !state.error && !state.loading;
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
  }, [conversation?.messages.length, active]);
  async function send() {
    const text = draft;
    await wechat.send(id, text, () => setDraft(""));
  }
  return (
    <Page
      className="wechat-chat"
      navBar={
        <NavBar
          title={name}
          back={{ label: "微信", onClick: navigation.pop }}
          right={<Button onClick={() => navigation.push({ page: "person", id })}>资料</Button>}
        />
      }
      footerHeight={62}
      footer={
        <form
          className="wechat-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="消息"
            rows={1}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              wechat.setDraft(id, event.target.value);
            }}
          />
          <button type="submit" disabled={!available || running || !draft.trim()}>
            发送
          </button>
        </form>
      }
    >
      <div className="wechat-messages">
        {conversation?.messages.map((message) => {
          const mine = message.senderId === state.data.account?.id;
          const sender =
            state.people.find((person) => person.id === message.senderId)?.name ??
            conversation.people.find((person) => person.id === message.senderId)!.name;
          return (
            <div
              key={message.id}
              className={`wechat-message ${mine ? "wechat-message--mine" : ""}`}
            >
              <PersonAvatar name={sender} />
              <p>{message.content.text}</p>
            </div>
          );
        })}
      </div>
      {!available && (
        <p className="wechat-notice">{state.error ?? "当前人物资料不可用，仍可阅读历史。"}</p>
      )}
      {reply?.status === "running" && (
        <div className="wechat-reply" role="status">
          对方正在输入… <Button onClick={() => wechat.cancel()}>停止</Button>
        </div>
      )}
      {reply?.status === "error" && (
        <div className="wechat-reply" role="alert">
          <p>{reply.error}</p>
          {reply.retry && (
            <Button disabled={!available} onClick={() => void wechat.retry(id)}>
              重试回复
            </Button>
          )}
        </div>
      )}
      <div ref={end} />
    </Page>
  );
}
