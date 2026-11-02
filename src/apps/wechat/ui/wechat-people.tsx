import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { PersonAvatar, type WechatPageProps } from "./wechat-page.tsx";

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
            disabled={state.loading || !!state.error}
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
            {state.data.account?.id === person.id && <span aria-label="当前帐号">✓</span>}
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
  const person = state.people.find((person) => person.id === id);
  return (
    <Page navBar={<NavBar title="人物资料" back={{ label: "微信", onClick: navigation.pop }} />}>
      {person ? (
        <div className="wechat-profile">
          <PersonAvatar name={person.name} />
          <h2>{person.name}</h2>
          <p>{person.profileText}</p>
          <Button onClick={() => navigation.push({ page: "chat", id })}>发消息</Button>
        </div>
      ) : (
        <p className="wechat-notice">当前人物资料不可用。</p>
      )}
    </Page>
  );
}
