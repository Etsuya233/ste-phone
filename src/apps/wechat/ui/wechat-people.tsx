import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { PersonAvatar, type WechatPageProps } from "./wechat-page.tsx";
import { PersonIdentity, ProfileFields } from "./wechat-profile.tsx";

export function WechatAccounts({ wechat, state, navigation }: WechatPageProps) {
  return (
    <Page navBar={<NavBar title="切换帐号" back={{ label: "微信", onClick: navigation.pop }} />}>
      <p className="wechat-notice">选择当前使用的人物。切换将停止当前回复。</p>
      {state.error && (
        <p className="wechat-notice" role="alert">
          {state.error}
        </p>
      )}
      <div className="wechat-rows">
        {state.people.map((person) => (
          <button
            type="button"
            className="wechat-row"
            key={person.id}
            disabled={
              state.loading ||
              !!state.error ||
              state.reply.status === "sending" ||
              state.reply.status === "saving" ||
              state.reply.status === "stopping"
            }
            onClick={() =>
              void wechat.selectAccount(person.id).then((saved) => {
                if (saved && person.id === state.data.account?.id) {
                  navigation.pop();
                }
              })
            }
          >
            <PersonAvatar name={person.name} />
            <strong>{person.name}</strong>
            {state.data.account?.id === person.id && (
              <span className="wechat-row-mark" aria-label="当前帐号">
                ✓
              </span>
            )}
          </button>
        ))}
      </div>
      {!state.loading && !state.people.length && (
        <p className="wechat-notice">当前资料中没有可选人物。</p>
      )}
    </Page>
  );
}

export function WechatPerson({ state, navigation, id }: WechatPageProps & { id: string }) {
  const person = state.people.find((item) => item.id === id);
  const self = state.data.account?.id === id;
  const content = person ? (
    <>
      <PersonIdentity name={person.name} />
      {person.profileText ? (
        <ProfileFields name={person.name} profileText={person.profileText} />
      ) : (
        <p className="wechat-notice">暂无人物简介。</p>
      )}
    </>
  ) : (
    <p className="wechat-notice">当前人物资料不可用。</p>
  );
  const navBar = (
    <NavBar
      title={self ? "个人信息" : "人物资料"}
      back={{ label: self ? "我" : "微信", onClick: navigation.pop }}
    />
  );
  return self ? (
    <Page navBar={navBar}>{content}</Page>
  ) : (
    <Page
      navBar={navBar}
      footerHeight={62}
      footer={
        <div className="wechat-action">
          <Button
            variant="filled"
            disabled={!person}
            onClick={() => navigation.push({ page: "chat", id })}
          >
            发消息
          </Button>
        </div>
      }
    >
      {content}
    </Page>
  );
}
