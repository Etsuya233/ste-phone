import { useState } from "react";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { CampusAccount } from "../campus-domain.ts";
import { AccountAvatar } from "./campus-avatar.tsx";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";

export function CampusAccountSwitcher(props: CampusPageProps) {
  const { service, state, navigation } = props;
  const [pending, setPending] = useState<string | null>(null);
  const authors = new Map(state.authors.map((author) => [author.id, author.name]));
  const accounts = state.data.accounts
    .filter(
      (account) =>
        !account.disabled && account.owner.kind === "memory" && authors.has(account.owner.id),
    )
    .toSorted((left, right) => {
      const active = state.data.activeAccountId;
      if (left.id === active) {
        return -1;
      }
      if (right.id === active) {
        return 1;
      }
      return left.nickname.localeCompare(right.nickname, "zh-Hans-CN");
    });
  const saving = state.phase === "saving";

  async function switchTo(account: CampusAccount) {
    setPending(null);
    const saved = await service.switchAccount(account.id);
    if (saved && navigation.current) {
      navigation.pop();
    }
  }

  function choose(account: CampusAccount) {
    if (saving) {
      return;
    }
    if (account.id === state.data.activeAccountId) {
      navigation.pop();
      return;
    }
    if (state.phase === "generating") {
      setPending(account.id);
      return;
    }
    void switchTo(account);
  }

  const target = accounts.find(({ id }) => id === pending);
  return (
    <>
      <div inert={target !== undefined}>
        <CampusPage {...props} title="切换账号" back={navigation.pop}>
          {accounts.length ? (
            <div className="campus-switcher">
              {accounts.map((account) => {
                const active = account.id === state.data.activeAccountId;
                const owner =
                  account.owner.kind === "memory" ? authors.get(account.owner.id) : undefined;
                const detail = [
                  owner && owner !== account.nickname ? owner : "剧情人物",
                  account.privateIdentity ? "小号" : "公开身份",
                ].join(" · ");
                return (
                  <button
                    type="button"
                    className={`campus-switcher-row${active ? " campus-switcher-row--active" : ""}`}
                    key={account.id}
                    aria-current={active ? "true" : undefined}
                    disabled={saving}
                    onClick={() => choose(account)}
                  >
                    <AccountAvatar account={account} />
                    <span className="campus-switcher-name">
                      <strong>{account.nickname}</strong>
                      <small>{detail}</small>
                    </span>
                    <span className="campus-meta">{active ? "当前" : "切换"}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <section className="campus-section campus-welcome">
              <h2>还没有可切换的账号</h2>
              <p>先从人物资料创建账号，再以人物身份参与社区。</p>
              <div className="campus-row">
                <Button
                  variant="filled"
                  disabled={!state.authorsReady || state.phase !== "idle"}
                  onClick={() => navigation.push({ page: "create-accounts" })}
                >
                  批量创建角色账号
                </Button>
                <Button
                  disabled={!state.scopeKey || state.phase !== "idle"}
                  onClick={() => navigation.push({ page: "manage" })}
                >
                  管理账号
                </Button>
              </div>
            </section>
          )}
          {accounts.length ? (
            <div className="campus-section">
              <Button onClick={() => navigation.push({ page: "manage" })}>管理账号</Button>
            </div>
          ) : null}
        </CampusPage>
      </div>
      {target ? (
        <Alert
          title="切换账号？"
          active={navigation.current}
          onDismiss={() => setPending(null)}
          actions={[
            { label: "取消", onClick: () => setPending(null) },
            { label: "切换", onClick: () => void switchTo(target), primary: true },
          ]}
        >
          切换账号会停止当前正在生成的 AI 内容。
        </Alert>
      ) : null}
    </>
  );
}
