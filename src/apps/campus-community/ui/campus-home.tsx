import { useEffect, useRef, useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import { CampusFeed, type CampusTab } from "./campus-feed.tsx";
import { FollowingIcon, HomeIcon, PersonIcon } from "./campus-icons.tsx";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";
import { CampusProfile } from "./campus-profiles.tsx";
import { useCampusClock } from "./use-campus-clock.ts";

const tabs = [
  { name: "首页", icon: <HomeIcon /> },
  { name: "关注", icon: <FollowingIcon /> },
  { name: "我", icon: <PersonIcon /> },
] as const;

export function CampusHome(props: CampusPageProps) {
  const { state, navigation, onHome, active } = props;
  const [tab, setTab] = useState<CampusTab>("首页");
  const now = useCampusClock(active);
  const top = useRef<HTMLDivElement>(null);
  const account = state.data.accounts.find((item) => item.id === state.data.activeAccountId);
  const writable = state.scopeKey !== null && state.phase === "idle";
  useEffect(() => {
    const scroller = top.current?.closest(".ios-page-content");
    if (scroller instanceof HTMLElement) {
      scroller.scrollTo({ top: 0 });
    }
  }, [tab]);

  return (
    <CampusPage
      {...props}
      title="Twitter"
      home
      back={onHome}
      right={
        <Button
          className="campus-nav-publish"
          variant="filled"
          disabled={!account || !writable}
          onClick={() => navigation.push({ page: "compose" })}
        >
          发布
        </Button>
      }
      footer={
        <nav className="campus-tab-bar" aria-label="Twitter">
          {tabs.map(({ name, icon }) => (
            <Button
              key={name}
              aria-current={tab === name ? "page" : undefined}
              onClick={() => setTab(name)}
            >
              <span className="campus-tab-icon">{icon}</span>
              <span>{name}</span>
            </Button>
          ))}
        </nav>
      }
    >
      <div ref={top}>
        {tab === "我" ? (
          <CampusProfile {...props} account={account} now={now} self />
        ) : (
          <CampusFeed {...props} account={account} tab={tab} now={now} />
        )}
      </div>
    </CampusPage>
  );
}
