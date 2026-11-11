import { useEffect, useRef, useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { CampusAccount } from "../campus-domain.ts";
import { AccountAvatar } from "./campus-avatar.tsx";
import { SparkleIcon } from "./campus-icons.tsx";
import type { CampusPageProps } from "./campus-page.tsx";
import { CampusPostCard } from "./campus-post-card.tsx";

export type CampusTab = "首页" | "关注" | "我";

export function CampusFeed({
  account,
  tab,
  now,
  ...props
}: CampusPageProps & {
  account: CampusAccount | undefined;
  tab: Exclude<CampusTab, "我">;
  now: Date;
}) {
  const { service, state, navigation } = props;
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const savedBatchId = state.lastSaved?.batchId;
  const revealedBatchId = state.revealedBatchId;
  const writable = state.scopeKey !== null && state.phase === "idle";
  const posts =
    tab === "关注"
      ? state.data.posts.filter((post) => account?.following.includes(post.authorId))
      : state.data.posts;

  useEffect(() => {
    const saved = state.lastSaved;
    if (
      !navigation.current ||
      !saved ||
      saved.batchId === revealedBatchId ||
      saved.targetPostId !== null ||
      !saved.postIds.length
    ) {
      return;
    }
    // 信息流倒序展示，批次最后一条帖子位于最上方。
    const first = saved.postIds.at(-1)!;
    setHighlightPostId(first);
    const frame = requestAnimationFrame(() => {
      const element = top.current?.querySelector<HTMLElement>(`[data-post-id="${first}"]`);
      element?.scrollIntoView({ block: "start" });
      service.markSavedRevealed(saved.batchId);
    });
    return () => cancelAnimationFrame(frame);
    // 同一批帖子只定位一次。
  }, [savedBatchId, revealedBatchId, navigation.current]);
  useEffect(() => {
    if (!highlightPostId) {
      return;
    }
    const timer = setTimeout(() => setHighlightPostId(null), 2400);
    return () => clearTimeout(timer);
  }, [highlightPostId]);

  return (
    <div ref={top}>
      <div className="campus-feed-header">
        <CampusIdentity
          account={account}
          onClick={() => navigation.push({ page: "switch-account" })}
        />
        {tab === "首页" ? (
          <Button
            className="campus-ai-button"
            disabled={!writable}
            onClick={() => navigation.push({ page: "generate", postId: null })}
          >
            <span className="campus-button-icon">
              <SparkleIcon />
            </span>
            AI 发帖
          </Button>
        ) : null}
      </div>
      {!account && state.scopeKey !== null ? (
        <section className="campus-section campus-welcome">
          <h2>选择一个账号</h2>
          <p>以剧情人物的身份发帖、点赞和回复。</p>
          <div className="campus-row">
            <Button variant="filled" onClick={() => navigation.push({ page: "switch-account" })}>
              选择账号
            </Button>
            <Button
              disabled={!state.authorsReady || state.phase !== "idle"}
              onClick={() => navigation.push({ page: "create-accounts" })}
            >
              批量创建角色账号
            </Button>
          </div>
        </section>
      ) : null}
      {!posts.length ? (
        <CampusEmptyFeed
          tab={tab}
          account={account}
          state={state}
          onGenerate={() => navigation.push({ page: "generate", postId: null })}
        />
      ) : null}
      {posts.toReversed().map((post) => (
        <CampusPostCard
          key={post.id}
          service={service}
          state={state}
          navigation={navigation}
          post={post}
          now={now}
          highlight={post.id === highlightPostId}
        />
      ))}
      {tab === "关注" && account ? <CampusSuggestions service={service} state={state} /> : null}
    </div>
  );
}

function CampusIdentity({
  account,
  onClick,
}: {
  account: CampusAccount | undefined;
  onClick: () => void;
}) {
  return (
    <button type="button" className="campus-identity" onClick={onClick}>
      {account ? (
        <AccountAvatar account={account} size="small" />
      ) : (
        <span className="campus-avatar campus-avatar--small" aria-hidden="true">
          ?
        </span>
      )}
      <span>{account ? account.nickname : "选择账号"}</span>
      <span className="campus-identity-hint">切换</span>
    </button>
  );
}

function samePerson(left: CampusAccount, right: CampusAccount): boolean {
  if (left.id === right.id) {
    return true;
  }
  if (left.owner.kind === "memory" && right.owner.kind === "memory") {
    return left.owner.id === right.owner.id;
  }
  if (left.owner.kind === "person" && right.owner.kind === "person") {
    return left.owner.id === right.owner.id;
  }
  return false;
}

function CampusEmptyFeed({
  tab,
  account,
  state,
  onGenerate,
}: {
  tab: CampusTab;
  account: CampusAccount | undefined;
  state: CampusPageProps["state"];
  onGenerate: () => void;
}) {
  if (tab === "关注") {
    return (
      <p className="campus-section campus-meta">
        {account ? "关注的账号还没有发帖。" : "选择账号后可以查看关注动态。"}
      </p>
    );
  }
  return (
    <section className="campus-section campus-welcome">
      <h2>首页还没有帖子</h2>
      <p>可以让 AI 先发一批，或者自己发布第一条。</p>
      <Button
        variant="filled"
        disabled={state.scopeKey === null || state.phase !== "idle"}
        onClick={onGenerate}
      >
        让 AI 发一批帖子
      </Button>
    </section>
  );
}

function CampusSuggestions({ service, state }: Pick<CampusPageProps, "service" | "state">) {
  const current = state.data.accounts.find(({ id }) => id === state.data.activeAccountId);
  if (!current) {
    return null;
  }
  const counts = new Map<string, number>();
  for (const post of state.data.posts) {
    counts.set(post.authorId, (counts.get(post.authorId) ?? 0) + 1);
  }
  const suggestions = state.data.accounts
    .filter(
      (candidate) =>
        !candidate.disabled &&
        (counts.get(candidate.id) ?? 0) > 0 &&
        !samePerson(candidate, current) &&
        !current.following.includes(candidate.id),
    )
    .toSorted((left, right) => (counts.get(right.id) ?? 0) - (counts.get(left.id) ?? 0))
    .slice(0, 4);
  return (
    <section className="campus-section campus-suggestions" aria-label="推荐关注">
      <h2>推荐关注</h2>
      {suggestions.length ? (
        suggestions.map((candidate) => (
          <div className="campus-suggestion" key={candidate.id}>
            <AccountAvatar account={candidate} size="small" />
            <span className="campus-suggestion-name">
              <strong>{candidate.nickname}</strong>
              <small>
                {counts.get(candidate.id) ?? 0} 条帖子
                {candidate.bio ? ` · ${candidate.bio}` : ""}
              </small>
            </span>
            <Button
              className="campus-follow-button"
              variant="filled"
              disabled={state.phase !== "idle"}
              onClick={() => void service.command({ type: "follow", accountId: candidate.id })}
            >
              关注
            </Button>
          </div>
        ))
      ) : (
        <p className="campus-meta">暂时没有更多可关注的账号。</p>
      )}
    </section>
  );
}
