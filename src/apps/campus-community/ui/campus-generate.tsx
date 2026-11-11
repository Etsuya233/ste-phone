import { useEffect, useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { CampusAccount } from "../campus-domain.ts";
import { AccountAvatar, AccountName } from "./campus-avatar.tsx";
import { SparkleIcon } from "./campus-icons.tsx";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";

export function CampusGeneratePage(props: CampusPageProps & { postId: string | null }) {
  const { service, state, navigation, postId } = props;
  const [selected, setSelected] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [manual, setManual] = useState(false);
  const [query, setQuery] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const completed = submittedId !== null && submittedId === state.completedBatchId;
  const busy = state.phase !== "idle";
  const post = postId === null ? null : state.data.posts.find(({ id }) => id === postId);
  const accounts = state.data.accounts.filter(
    ({ owner, disabled }) =>
      !disabled &&
      (owner.kind !== "person" || !state.data.people.find(({ id }) => id === owner.id)?.disabled) &&
      (owner.kind !== "memory" || state.authors.some(({ id }) => id === owner.id)),
  );
  const available = selected.filter((id) => accounts.some((account) => account.id === id));
  const title = postId === null ? "AI 生成帖子" : "AI 生成评论";

  useEffect(() => {
    if (completed && navigation.current) {
      navigation.pop();
    }
  }, [completed, navigation]);

  function toggle(id: string) {
    setSelected((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id],
    );
  }

  function ownerLabel(account: CampusAccount): string {
    const { owner } = account;
    if (owner.kind === "memory") {
      const name = state.authors.find(({ id }) => id === owner.id)?.name;
      return name && name !== account.nickname ? name : "剧情人物";
    }
    if (owner.kind === "person") {
      return state.data.people.find(({ id }) => id === owner.id)?.profile ?? "路人";
    }
    return "公共账号";
  }

  const keyword = query.trim().toLocaleLowerCase();
  const visible = accounts.filter(
    (account) =>
      account.nickname.toLocaleLowerCase().includes(keyword) ||
      ownerLabel(account).toLocaleLowerCase().includes(keyword),
  );
  const groups = [
    { label: "剧情人物", key: "memory" },
    { label: "路人", key: "person" },
    { label: "公共账号", key: "public" },
  ].map((group) => ({
    ...group,
    accounts: visible.filter(({ owner }) => owner.kind === group.key),
  }));

  return (
    <CampusPage {...props} title={title} back={navigation.pop}>
      <form
        className="campus-form"
        onSubmit={(event) => {
          event.preventDefault();
          const targetReady = postId === null || Boolean(post);
          if (!busy && (!manual || available.length) && targetReady) {
            setSubmittedId(service.start(manual ? available : [], instruction, postId));
          }
        }}
      >
        {post ? (
          <section className="campus-generate-target">
            <div className="campus-generate-target-head">
              <AccountAvatar
                account={state.data.accounts.find(({ id }) => id === post.authorId)!}
                size="small"
              />
              <AccountName
                account={state.data.accounts.find(({ id }) => id === post.authorId)!}
                onClick={() => navigation.push({ page: "profile", accountId: post.authorId })}
              />
              <span className="campus-meta">
                {(
                  post.backgroundComments + post.comments.filter(({ deleted }) => !deleted).length
                ).toLocaleString("zh-CN")}{" "}
                条评论
              </span>
            </div>
            <p>{post.text || post.images[0]?.description || "（仅配图）"}</p>
          </section>
        ) : postId !== null ? (
          <p className="campus-hint" role="alert">
            目标帖子已删除，无法生成互动。
          </p>
        ) : null}
        <div className="campus-mode-switch" role="group" aria-label="选人方式">
          <Button aria-pressed={!manual} onClick={() => setManual(false)}>
            自动选人
          </Button>
          <Button aria-pressed={manual} onClick={() => setManual(true)}>
            指定账号
          </Button>
        </div>
        <p className="campus-meta">
          {manual
            ? "只使用勾选范围内的账号；可以少用，不会自动加入其他人。"
            : "根据话题自动选择账号，也可以创建新的路人。"}
        </p>
        <label>
          本次要求（可选）
          <textarea
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            rows={3}
            disabled={busy}
            placeholder="想看到什么话题、语气或事件？"
          />
        </label>
        {manual ? (
          <>
            <div className="campus-candidate-heading">
              <span>已选 {available.length} 个</span>
              <div className="campus-row">
                <Button
                  disabled={busy || !visible.length}
                  onClick={() =>
                    setSelected((previous) => [
                      ...new Set([...previous, ...visible.map(({ id }) => id)]),
                    ])
                  }
                >
                  全选
                </Button>
                <Button disabled={busy || !selected.length} onClick={() => setSelected([])}>
                  清空
                </Button>
              </div>
            </div>
            <input
              type="search"
              className="campus-candidate-search"
              aria-label="搜索账号"
              placeholder="搜索账号"
              value={query}
              disabled={busy}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="campus-candidate-groups">
              {groups.map((group) =>
                group.accounts.length ? (
                  <section key={group.key} className="campus-candidate-group">
                    <h3>{group.label}</h3>
                    {group.accounts.map((account) => (
                      <label key={account.id} className="campus-candidate">
                        <input
                          type="checkbox"
                          checked={selected.includes(account.id)}
                          disabled={busy}
                          onChange={() => toggle(account.id)}
                        />
                        <AccountAvatar account={account} size="small" />
                        <span>
                          <strong>{account.nickname}</strong>
                          <small>
                            {ownerLabel(account)}
                            {account.privateIdentity ? " · 小号" : ""}
                            {account.id === state.data.activeAccountId ? " · 当前账号" : ""}
                          </small>
                        </span>
                      </label>
                    ))}
                  </section>
                ) : null,
              )}
              {!visible.length ? <p className="campus-meta">没有匹配的账号。</p> : null}
            </div>
          </>
        ) : null}
        {completed ? (
          <div className="campus-feedback">
            <p role="status">{postId === null ? "新帖子已保存。" : "本批互动已保存。"}</p>
            <Button onClick={navigation.pop}>{postId === null ? "查看首页" : "返回帖子"}</Button>
          </div>
        ) : null}
        <Button
          className="campus-generate-submit"
          variant="filled"
          type="submit"
          disabled={busy || (manual && !available.length) || (postId !== null && !post)}
        >
          <span className="campus-button-icon">
            <SparkleIcon />
          </span>
          {postId === null ? "生成帖子" : "生成评论"}
        </Button>
      </form>
    </CampusPage>
  );
}
