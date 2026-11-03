import { useLayoutEffect, useRef } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";
import {
  MomentAuthor,
  MomentCommentView,
  MomentContentView,
  momentWritingReason,
} from "./wechat-moment-content.tsx";

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
  return (
    <Page
      navBar={
        <NavBar
          title="朋友圈"
          back={{ label: "发现", onClick: navigation.pop }}
          right={
            <Button
              disabled={!!reason}
              onClick={() =>
                navigation.push({
                  page: "moment-compose",
                  scopeId,
                  onPublished: () => {
                    revealPublished.current = true;
                  },
                })
              }
            >
              发布
            </Button>
          }
        />
      }
    >
      {reason ? <p className="wechat-notice">{reason}</p> : null}
      <div className="wechat-moment-ai-actions">
        <Button
          disabled={!!reason}
          onClick={() => navigation.push({ page: "moment-ai-author", scopeId })}
        >
          AI 发布动态
        </Button>
      </div>
      {!moments.length ? <p className="wechat-notice">暂无动态，分享此刻的日常吧。</p> : null}
      <div ref={feed} className="wechat-moments-feed">
        {moments.toReversed().map((moment) => (
          <article className="wechat-moment" key={moment.id}>
            <MomentAuthor author={moment.author} state={state} navigation={navigation} />
            <button
              type="button"
              className="wechat-moment-open"
              aria-label={`查看动态：${moment.text || "媒体分享"}`}
              onClick={() => navigation.push({ page: "moment-detail", scopeId, id: moment.id })}
            >
              <MomentContentView moment={moment} compact />
            </button>
            {moment.comments.slice(-3).map((comment) => (
              <MomentCommentView key={comment.id} moment={moment} comment={comment} state={state} />
            ))}
            <Button
              onClick={() => navigation.push({ page: "moment-detail", scopeId, id: moment.id })}
            >
              {moment.comments.length ? `查看全部 ${moment.comments.length} 条评论` : "评论"}
            </Button>
          </article>
        ))}
      </div>
    </Page>
  );
}
