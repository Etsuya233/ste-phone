import { useLayoutEffect, useRef } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";
import { momentWritingReason } from "./wechat-moment-content.tsx";
import { MomentCard } from "./wechat-moment-card.tsx";

export function WechatMoments({
  state,
  navigation,
  scopeId,
}: WechatPageProps & { scopeId: string }) {
  const moments = state.data.moments?.[scopeId] ?? [];
  const reason = momentWritingReason(state, scopeId);
  const feed = useRef<HTMLDivElement>(null);
  const revealPublished = useRef(false);
  useLayoutEffect(() => {
    // 只消费本页发起的发布成功通知，等导航返回后定位；普通浏览返回保留阅读位置。
    if (navigation.current && revealPublished.current) {
      feed.current!.closest(".ios-page-content")!.scrollTop = 0;
      revealPublished.current = false;
    }
  }, [navigation.current]);
  function publish() {
    navigation.push({
      page: "moment-compose",
      scopeId,
      onPublished: () => {
        revealPublished.current = true;
      },
    });
  }
  function aiPublish() {
    navigation.push({ page: "moment-ai-author", scopeId });
  }
  function open(id: string) {
    navigation.push({ page: "moment-detail", scopeId, id });
  }
  return (
    <Page
      navBar={
        <NavBar
          title="朋友圈"
          back={{ label: "发现", onClick: navigation.pop }}
          right={
            <Button className="wechat-moment-primary" disabled={!!reason} onClick={publish}>
              发布
            </Button>
          }
        />
      }
    >
      {reason ? <p className="wechat-notice">{reason}</p> : null}
      {moments.length ? (
        <div className="wechat-moment-ai-toolbar">
          <Button disabled={!!reason} onClick={aiPublish}>
            AI 生成动态
          </Button>
        </div>
      ) : state.loading || state.error ? null : (
        <div className="wechat-moments-empty">
          <strong>还没有动态</strong>
          <p>分享此刻的日常，或让 AI 以朋友的身份发一条。</p>
          <Button
            variant="filled"
            className="wechat-moment-primary"
            disabled={!!reason}
            onClick={publish}
          >
            发布第一条动态
          </Button>
          <Button className="wechat-moment-ai-empty" disabled={!!reason} onClick={aiPublish}>
            AI 生成动态
          </Button>
        </div>
      )}
      <div ref={feed} className="wechat-moments-feed">
        {moments.toReversed().map((moment) => (
          <MomentCard
            key={moment.id}
            moment={moment}
            state={state}
            navigation={navigation}
            onOpen={() => open(moment.id)}
          />
        ))}
      </div>
    </Page>
  );
}
