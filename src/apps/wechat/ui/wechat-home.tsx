import { WechatSendPreferences } from "./wechat-send-preferences.tsx";
import { useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { NavBarActionGroup } from "../../../frontend/foundation/nav-bar.tsx";
import { canReadWechatGroup } from "../wechat-group.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { Icon } from "../../../frontend/foundation/icon.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import type { CharacterProfile } from "../../data-source/public.ts";
import type { WechatConversation, WechatPerson } from "../wechat.ts";
import { PersonAvatar, type WechatPageProps } from "./wechat-page.tsx";
import { PersonIdentity, ProfilePreview } from "./wechat-profile.tsx";
import { formatWechatTime } from "../wechat-time.ts";
import { describeWechatMessageContent } from "../wechat-message-content.ts";
import { useWechatClock } from "./use-wechat-clock.ts";
import { WechatDiscover } from "./wechat-discover.tsx";

export function WechatHome({
  wechat,
  state,
  navigation,
  onHome,
  preferences,
  active,
}: WechatPageProps & { onHome(): void; active: boolean }) {
  const now = useWechatClock(active);
  const [tab, setTab] = useState("微信");
  const account = state.data.account;
  const self = account ? state.people.find((person) => person.id === account.id) : undefined;
  const conversations = state.data.conversations
    .filter(
      (item) =>
        account &&
        (item.kind === "group"
          ? canReadWechatGroup(item, account)
          : item.messages.length > 0 &&
            item.people.some(
              (person) => person.id === account.id && person.scopeId === account.scopeId,
            )),
    )
    .toSorted(
      (left, right) =>
        (Date.parse(right.messages.at(-1)?.createdAt ?? "") || 0) -
        (Date.parse(left.messages.at(-1)?.createdAt ?? "") || 0),
    );
  return (
    <Page
      navBar={
        <NavBar
          title={tab}
          back={{ label: "主屏幕", onClick: onHome }}
          right={
            account && tab === "微信" ? (
              <NavBarActionGroup label="会话操作">
                <Button
                  aria-label="发起群聊"
                  disabled={state.loading || !!state.error}
                  onClick={() => navigation.push({ page: "group-details" })}
                >
                  ＋
                </Button>
                <Button onClick={() => void wechat.prepare()}>刷新</Button>
              </NavBarActionGroup>
            ) : (
              <Button onClick={() => void wechat.prepare()}>刷新</Button>
            )
          }
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
      {tab === "发现" ? (
        <WechatDiscover state={state} navigation={navigation} />
      ) : !account ? (
        <div className="wechat-welcome">
          <h2>选择你的帐号</h2>
          <p>以人物的视角，聊聊故事里的日常。</p>
          <Button onClick={() => navigation.push({ page: "accounts" })}>选择帐号</Button>
        </div>
      ) : (
        <>
          {tab === "微信" && (
            <WechatConversations
              account={account}
              conversations={conversations}
              people={state.people}
              now={now}
              onOpen={(id, group) => navigation.push({ page: group ? "group-chat" : "chat", id })}
            />
          )}
          {tab === "通讯录" && (
            <WechatContacts
              people={state.people.filter((person) => person.id !== account.id)}
              onOpen={(id) => navigation.push({ page: "person", id })}
            />
          )}
          {tab === "我" && (
            <WechatMe
              preferences={preferences}
              name={self?.name ?? account.name}
              path={self?.avatar?.imagePath}
              profileText={self?.profileText ?? ""}
              onOpenProfile={() => navigation.push({ page: "person", id: account.id })}
              onSwitchAccount={() => navigation.push({ page: "accounts" })}
              onOpenStickers={() => navigation.push({ page: "stickers" })}
              onOpenSettings={() => navigation.push({ page: "settings" })}
            />
          )}
        </>
      )}
    </Page>
  );
}

function WechatConversations({
  account,
  conversations,
  people,
  onOpen,
  now,
}: {
  account: WechatPerson;
  conversations: readonly WechatConversation[];
  people: readonly CharacterProfile[];
  onOpen(id: string, group: boolean): void;
  now: Date;
}) {
  return (
    <div className="wechat-rows">
      {conversations.length ? (
        conversations.map((conversation) => {
          const group = conversation.kind === "group" ? conversation : undefined;
          const other = group
            ? undefined
            : conversation.people.find((person) => person.id !== account.id);
          const last = conversation.messages.at(-1);
          const person = other && people.find((item) => item.id === other.id);
          const name = group?.name ?? person?.name ?? other!.name;
          const summary = !last
            ? ""
            : last.recalled
              ? "消息已撤回"
              : last.content.type === "text"
                ? last.content.text
                : describeWechatMessageContent(last.content);
          return (
            <button
              type="button"
              className="wechat-row wechat-row--conversation"
              key={conversation.id}
              onClick={() => onOpen(group?.id ?? other!.id, !!group)}
            >
              <PersonAvatar path={person?.avatar?.imagePath} name={name} />
              <span>
                <span className="wechat-conversation-heading">
                  <strong>{name}</strong>
                  {last ? (
                    <time
                      dateTime={last.createdAt}
                      title={new Date(last.createdAt).toLocaleString("zh-CN")}
                    >
                      {formatWechatTime(last.createdAt, now, true)}
                    </time>
                  ) : null}
                </span>
                <small>{summary}</small>
              </span>
            </button>
          );
        })
      ) : (
        <p className="wechat-notice">还没有聊天，去通讯录找个人说说话。</p>
      )}
    </div>
  );
}

function WechatContacts({
  people,
  onOpen,
}: {
  people: readonly CharacterProfile[];
  onOpen(id: string): void;
}) {
  const [query, setQuery] = useState("");
  const keyword = query.trim().toLocaleLowerCase();
  const visible = people
    .filter((person) => person.name.toLocaleLowerCase().includes(keyword))
    .toSorted((left, right) => left.name.localeCompare(right.name, "zh-Hans-CN"));
  return (
    <>
      <div className="wechat-search">
        <input
          type="search"
          aria-label="搜索联系人"
          placeholder="搜索联系人"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="wechat-rows">
        {visible.map((person) => (
          <button
            type="button"
            className="wechat-row"
            key={person.id}
            onClick={() => onOpen(person.id)}
          >
            <PersonAvatar path={person.avatar?.imagePath} name={person.name} />
            <span>
              <strong>{person.name}</strong>
            </span>
          </button>
        ))}
        {!visible.length && (
          <p className="wechat-notice">{keyword ? "没有匹配的联系人。" : "还没有其他人物。"}</p>
        )}
      </div>
    </>
  );
}

function WechatMe({
  preferences,
  name,
  profileText,
  path,
  onOpenProfile,
  onSwitchAccount,
  onOpenStickers,
  onOpenSettings,
}: {
  preferences: WechatPageProps["preferences"];
  name: string;
  profileText: string;
  path?: string;
  onOpenProfile(): void;
  onSwitchAccount(): void;
  onOpenStickers(): void;
  onOpenSettings(): void;
}) {
  return (
    <>
      <PersonIdentity name={name} path={path} />
      <ProfilePreview name={name} profileText={profileText} />
      <GroupedList>
        <ListCell title="个人资料" onClick={onOpenProfile} />
        <ListCell title="切换帐号" onClick={onSwitchAccount} />
        <ListCell title="表情包" onClick={onOpenStickers} />
        <ListCell title="设置" onClick={onOpenSettings} />
      </GroupedList>
      <WechatSendPreferences preferences={preferences} />
    </>
  );
}

function WechatTabs({ tab, onSelect }: { tab: string; onSelect(tab: string): void }) {
  const tabs = [
    { name: "微信", icon: <ChatTabIcon /> },
    { name: "通讯录", icon: <ContactsTabIcon /> },
    { name: "发现", icon: <DiscoverTabIcon /> },
    { name: "我", icon: <MeTabIcon /> },
  ];
  return (
    <nav className="wechat-tabs" aria-label="微信导航">
      {tabs.map(({ name, icon }) => (
        <button
          type="button"
          key={name}
          aria-current={tab === name ? "page" : undefined}
          onClick={() => onSelect(name)}
        >
          <Icon className="wechat-tab-icon">{icon}</Icon>
          {name}
        </button>
      ))}
    </nav>
  );
}

function ChatTabIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M12 4c-4.7 0-8.5 3-8.5 6.7 0 2.1 1.2 4 3.1 5.2l-.7 2.5 3-1.4c1 .3 2 .4 3.1.4 4.7 0 8.5-3 8.5-6.7S16.7 4 12 4Z" />
      <circle cx="8.6" cy="10.6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.6" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15.4" cy="10.6" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ContactsTabIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <rect x="4.5" y="4" width="15" height="16" rx="2.5" />
      <path d="M8 4v16" />
      <circle cx="14" cy="10.2" r="2.2" />
      <path d="M10.8 16.4c.5-1.5 1.7-2.3 3.2-2.3s2.7.8 3.2 2.3" />
    </svg>
  );
}

function MeTabIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="8.2" r="3.4" />
      <path d="M5.3 20c.7-3.4 3.4-5.4 6.7-5.4s6 2 6.7 5.4" />
    </svg>
  );
}

function DiscoverTabIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="8.5" />
      <path d="m15.8 8.2-2.5 5.1-5.1 2.5 2.5-5.1Z" />
    </svg>
  );
}
