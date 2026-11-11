import { useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";
import { CampusPostCard } from "./campus-post-card.tsx";
import { CampusProfile } from "./campus-profiles.tsx";

const tabs = ["广场", "关注", "我"] as const;

export function CampusHome(props: CampusPageProps) {
  const { state, navigation, onHome } = props;
  const [tab, setTab] = useState<(typeof tabs)[number]>("广场");
  const account = state.data.accounts.find((item) => item.id === state.data.activeAccountId);
  const writable = state.scopeKey !== null && state.phase === "idle";
  const posts =
    tab === "关注"
      ? state.data.posts.filter((post) => account?.following.includes(post.authorId))
      : state.data.posts;
  return (
    <CampusPage
      {...props}
      title="校园社区"
      home
      back={onHome}
      right={
        <Button
          disabled={!account || !writable}
          onClick={() => navigation.push({ page: "compose" })}
        >
          发布
        </Button>
      }
      footer={
        <nav className="campus-tab-bar" aria-label="校园社区">
          {tabs.map((label) => (
            <Button
              key={label}
              aria-current={tab === label ? "page" : undefined}
              onClick={() => setTab(label)}
            >
              {label}
            </Button>
          ))}
        </nav>
      }
    >
      {tab === "我" ? (
        <CampusProfile {...props} account={account} self />
      ) : (
        <>
          <div className="campus-feed-header">
            <h2>{tab}</h2>
            {tab === "广场" ? (
              <Button
                disabled={!writable}
                onClick={() => navigation.push({ page: "generate", postId: null })}
              >
                生成一批帖子
              </Button>
            ) : null}
          </div>
          {!account && state.scopeKey !== null ? (
            <div className="campus-section">
              <p>选择一个账号即可发帖、点赞和回复。</p>
              <Button variant="filled" onClick={() => navigation.push({ page: "manage" })}>
                管理账号
              </Button>
            </div>
          ) : null}
          {!posts.length ? (
            <p className="campus-section">
              {tab === "关注" ? "关注的账号还没有发帖。" : "广场还没有帖子。"}
            </p>
          ) : null}
          {posts.toReversed().map((post) => (
            <CampusPostCard key={post.id} {...props} post={post} />
          ))}
        </>
      )}
    </CampusPage>
  );
}
