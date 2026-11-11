import { Button } from "../../../frontend/foundation/button.tsx";
import type { CampusAccount } from "../campus-domain.ts";
import { formatCampusCount } from "../campus-display.ts";
import { AccountAvatar, AccountLink } from "./campus-avatar.tsx";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";
import { CampusPostCard } from "./campus-post-card.tsx";
import { useCampusClock } from "./use-campus-clock.ts";

export function CampusProfilePage(props: CampusPageProps & { accountId: string }) {
  const account = props.state.data.accounts.find(({ id }) => id === props.accountId);
  const now = useCampusClock(props.active);
  return (
    <CampusPage {...props} title="账号主页" back={props.navigation.pop}>
      <CampusProfile {...props} account={account} now={now} />
    </CampusPage>
  );
}

export function CampusProfile(
  props: CampusPageProps & { account: CampusAccount | undefined; now: Date; self?: boolean },
) {
  const { service, state, navigation, account, now, self } = props;
  const current = state.data.accounts.find(({ id }) => id === state.data.activeAccountId);
  const following = account ? current?.following.includes(account.id) : false;
  const posts = account
    ? state.data.posts.filter(({ authorId }) => authorId === account.id).reverse()
    : [];
  const followers = account
    ? state.data.accounts.filter(({ following }) => following.includes(account.id)).length
    : 0;
  const sameOwner =
    current &&
    account &&
    current.id !== account.id &&
    current.owner.kind === "memory" &&
    account.owner.kind === "memory" &&
    current.owner.id === account.owner.id &&
    !account.disabled;
  let operable = false;
  if (account && account.owner.kind === "memory" && !account.disabled) {
    const ownerId = account.owner.id;
    operable = state.authors.some(({ id }) => id === ownerId);
  }

  return (
    <>
      <section className="campus-profile">
        {account ? (
          <>
            <div className="campus-profile-heading">
              <AccountAvatar account={account} size="large" />
              <div className="campus-profile-name">
                <strong>{account.nickname}</strong>
                <span className="campus-meta">
                  {account.disabled
                    ? "账号已停用"
                    : account.privateIdentity
                      ? "未公开归属"
                      : "公开身份"}
                </span>
              </div>
            </div>
            {account.bio ? <p>{account.bio}</p> : null}
            <div className="campus-profile-stats">
              <span>
                <strong>{formatCampusCount(account.following.length)}</strong> 正在关注
              </span>
              <span>
                <strong>{formatCampusCount(followers)}</strong> 关注者
              </span>
              <span>
                <strong>{formatCampusCount(posts.length)}</strong> 帖子
              </span>
            </div>
            <div className="campus-row campus-profile-actions">
              {current && current.id !== account.id ? (
                <Button
                  className="campus-follow-button"
                  disabled={state.phase !== "idle" || (account.disabled && !following)}
                  variant={following ? "plain" : "filled"}
                  onClick={() => void service.command({ type: "follow", accountId: account.id })}
                >
                  {following ? "取消关注" : "关注"}
                </Button>
              ) : null}
              {sameOwner && operable ? (
                <Button
                  disabled={state.phase === "generating" || state.phase === "saving"}
                  onClick={() => void service.switchAccount(account.id)}
                >
                  切换到此账号
                </Button>
              ) : null}
              {self ? (
                <>
                  <Button
                    disabled={state.phase !== "idle"}
                    onClick={() => navigation.push({ page: "edit-account", accountId: account.id })}
                  >
                    编辑资料
                  </Button>
                  <Button onClick={() => navigation.push({ page: "switch-account" })}>
                    切换账号
                  </Button>
                  <Button onClick={() => navigation.push({ page: "manage" })}>管理账号</Button>
                </>
              ) : null}
            </div>
          </>
        ) : (
          <div className="campus-welcome">
            <h2>还没有选择操作账号</h2>
            <p>选择一个账号，或者先从人物资料批量创建。</p>
            <div className="campus-row">
              <Button variant="filled" onClick={() => navigation.push({ page: "switch-account" })}>
                选择账号
              </Button>
              {self ? (
                <Button
                  disabled={!state.authorsReady || state.phase !== "idle"}
                  onClick={() => navigation.push({ page: "create-accounts" })}
                >
                  批量创建角色账号
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </section>
      {posts.map((post) => (
        <CampusPostCard
          key={post.id}
          service={service}
          state={state}
          navigation={navigation}
          post={post}
          now={now}
        />
      ))}
    </>
  );
}

export function CampusManageAccounts(props: CampusPageProps) {
  const { service, state, navigation } = props;
  const { accounts, people, activeAccountId } = state.data;
  const ordered = accounts.toSorted((left, right) => {
    if (left.id === activeAccountId) {
      return -1;
    }
    if (right.id === activeAccountId) {
      return 1;
    }
    return left.nickname.localeCompare(right.nickname, "zh-Hans-CN");
  });
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
        <Button
          disabled={state.phase !== "idle" || !state.scopeKey || !state.authorsReady}
          onClick={() => navigation.push({ page: "create-accounts" })}
        >
          批量创建角色账号
        </Button>
        {!accounts.length ? <p>还没有账号。新建账号后即可选择一个剧情人物账号操作社区。</p> : null}
        {ordered.map((account) => {
          const { owner } = account;
          const ownerName =
            owner.kind === "memory"
              ? state.authors.find(({ id }) => id === owner.id)?.name
              : undefined;
          const description =
            owner.kind === "memory"
              ? ownerName && ownerName !== account.nickname
                ? ownerName
                : "剧情人物"
              : owner.kind === "person"
                ? people.find(({ id }) => id === owner.id)!.profile
                : "媒体或公告";
          const canOperate =
            owner.kind === "memory" && state.authors.some(({ id }) => id === owner.id);
          return (
            <div key={account.id} className="campus-manage-row">
              <div className="campus-manage-heading">
                <AccountLink
                  account={account}
                  onClick={() => navigation.push({ page: "profile", accountId: account.id })}
                />
                {account.disabled ? <span className="campus-badge">已停用</span> : null}
                {account.privateIdentity ? <span className="campus-badge">小号</span> : null}
              </div>
              <p className="campus-meta">{description}</p>
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
                    disabled={state.phase === "generating" || state.phase === "saving"}
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
