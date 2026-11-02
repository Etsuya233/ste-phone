import { useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { PersonAvatar, type WechatPageProps } from "./wechat-page.tsx";

export function WechatHome({
  wechat,
  state,
  navigation,
  onHome,
}: WechatPageProps & { onHome(): void }) {
  const [tab, setTab] = useState("微信");
  const account = state.data.account;
  const conversations = state.data.conversations
    .filter(
      (item) =>
        account &&
        item.people.some(
          (person) => person.id === account.id && person.scopeId === account.scopeId,
        ),
    )
    .toReversed();
  return (
    <Page
      navBar={
        <NavBar
          title={tab}
          back={{ label: "主屏幕", onClick: onHome }}
          right={<Button onClick={() => void wechat.prepare()}>刷新</Button>}
        />
      }
      footerHeight={50}
      footer={<WechatTabs tab={tab} onSelect={setTab} />}
    >
      {state.loading && <p className="wechat-notice">正在读取人物…</p>}
      {state.error && (
        <p role="alert" className="wechat-notice">
          {state.error}
        </p>
      )}
      {!account ? (
        <div className="wechat-welcome">
          <h2>选择你的帐号</h2>
          <p>以人物的视角，聊聊故事里的日常。</p>
          <Button onClick={() => navigation.push({ page: "accounts" })}>选择帐号</Button>
        </div>
      ) : (
        <>
          {tab === "微信" && (
            <div className="wechat-rows">
              {conversations.length ? (
                conversations.map((conversation) => {
                  const other = conversation.people.find((person) => person.id !== account.id)!;
                  const name =
                    state.scopeId === other.scopeId
                      ? (state.people.find((person) => person.id === other.id)?.name ?? other.name)
                      : other.name;
                  return (
                    <button
                      type="button"
                      className="wechat-row"
                      key={conversation.id}
                      onClick={() => navigation.push({ page: "chat", id: other.id })}
                    >
                      <PersonAvatar name={name} />
                      <span>
                        <strong>{name}</strong>
                        <small>{conversation.messages.at(-1)?.content.text}</small>
                      </span>
                    </button>
                  );
                })
              ) : (
                <p className="wechat-notice">还没有聊天，去通讯录找个人说说话。</p>
              )}
            </div>
          )}
          {tab === "通讯录" && (
            <div className="wechat-rows">
              {state.people
                .filter((person) => person.id !== account.id)
                .map((person) => (
                  <button
                    type="button"
                    className="wechat-row"
                    key={person.id}
                    onClick={() => navigation.push({ page: "person", id: person.id })}
                  >
                    <PersonAvatar name={person.name} />
                    <strong>{person.name}</strong>
                  </button>
                ))}
            </div>
          )}
          {tab === "我" && (
            <div className="wechat-profile">
              <PersonAvatar
                name={state.people.find((person) => person.id === account.id)?.name ?? account.name}
              />
              <h2>
                {state.people.find((person) => person.id === account.id)?.name ?? account.name}
              </h2>
              <Button onClick={() => navigation.push({ page: "accounts" })}>切换帐号</Button>
            </div>
          )}
        </>
      )}
    </Page>
  );
}

function WechatTabs({ tab, onSelect }: { tab: string; onSelect(tab: string): void }) {
  return (
    <nav className="wechat-tabs" aria-label="微信导航">
      {["微信", "通讯录", "我"].map((name) => (
        <button
          type="button"
          key={name}
          aria-current={tab === name ? "page" : undefined}
          onClick={() => onSelect(name)}
        >
          <span aria-hidden="true">{name === "微信" ? "☏" : name === "通讯录" ? "☷" : "○"}</span>
          {name}
        </button>
      ))}
    </nav>
  );
}
