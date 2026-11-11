import { Button } from "../../../frontend/foundation/button.tsx";
import type { CampusAccount } from "../campus-domain.ts";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";
import { AccountAvatar, AccountLink, CampusPostCard } from "./campus-post-card.tsx";

export function CampusProfilePage(props: CampusPageProps & { accountId: string }) {
  const account = props.state.data.accounts.find(({ id }) => id === props.accountId)!;
  return (
    <CampusPage {...props} title="账号主页" back={props.navigation.pop}>
      <CampusProfile {...props} account={account} />
    </CampusPage>
  );
}

export function CampusProfile(
  props: CampusPageProps & { account: CampusAccount | undefined; self?: boolean },
) {
  const { service, state, navigation, account, self } = props;
  const current = state.data.accounts.find(({ id }) => id === state.data.activeAccountId);
  const following = account ? current?.following.includes(account.id) : false;
  const posts = account
    ? state.data.posts.filter(({ authorId }) => authorId === account.id).reverse()
    : [];
  return (
    <>
      <section className="campus-profile">
        {account ? (
          <>
            <div className="campus-row">
              <AccountAvatar account={account} />
              <strong>{account.nickname}</strong>
            </div>
            {account.bio ? <p>{account.bio}</p> : null}
            {account.disabled ? <span className="campus-meta">账号已停用</span> : null}
            {current && current.id !== account.id ? (
              <Button
                disabled={state.phase !== "idle" || (account.disabled && !following)}
                variant={following ? "plain" : "filled"}
                onClick={() => void service.command({ type: "follow", accountId: account.id })}
              >
                {following ? "取消关注" : "关注"}
              </Button>
            ) : null}
          </>
        ) : (
          <p>还没有选择操作账号。</p>
        )}
        {self ? (
          <Button onClick={() => navigation.push({ page: "manage" })}>管理账号</Button>
        ) : null}
      </section>
      {posts.map((post) => (
        <CampusPostCard key={post.id} {...props} post={post} />
      ))}
    </>
  );
}

export function CampusManageAccounts(props: CampusPageProps) {
  const { service, state, navigation } = props;
  const { accounts, people, activeAccountId } = state.data;
  const canSwitch = state.phase !== "saving";
  return (
    <CampusPage
      {...props}
      title="管理账号"
      back={navigation.pop}
      right={
        <Button
          disabled={state.phase !== "idle" || !state.scopeKey}
          onClick={() => navigation.push({ page: "edit-account" })}
        >
          新建
        </Button>
      }
    >
      <div className="campus-section">
        {!accounts.length ? <p>还没有账号。新建账号后即可选择一个剧情人物账号操作社区。</p> : null}
        {accounts.map((account) => {
          const { owner } = account;
          const description =
            owner.kind === "memory"
              ? (state.authors.find(({ id }) => id === owner.id)?.name ?? "当前资料中无此人物")
              : owner.kind === "person"
                ? people.find(({ id }) => id === owner.id)!.profile
                : "媒体或公告";
          const canOperate =
            owner.kind === "memory" && state.authors.some(({ id }) => id === owner.id);
          return (
            <div key={account.id} className="campus-manage-row">
              <AccountLink
                account={account}
                onClick={() => navigation.push({ page: "profile", accountId: account.id })}
              />
              <p className="campus-meta">
                {description}
                {account.privateIdentity ? " · 小号" : ""}
                {account.disabled ? " · 已停用" : ""}
              </p>
              <div className="campus-row">
                <Button
                  disabled={state.phase !== "idle"}
                  onClick={() => navigation.push({ page: "edit-account", accountId: account.id })}
                >
                  编辑资料
                </Button>
                {activeAccountId === account.id ? (
                  <strong className="campus-meta">当前操作账号</strong>
                ) : canOperate && !account.disabled ? (
                  <Button
                    disabled={!canSwitch}
                    onClick={() => void service.switchAccount(account.id)}
                  >
                    切换到此账号
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </CampusPage>
  );
}
