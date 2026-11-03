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
        <div className="wechat-moment-ai-actions">
          <Button disabled={!!reason} onClick={aiPublish}>
            AI 发布动态
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
          <Button disabled={!!reason} onClick={aiPublish}>
            AI 发布动态
          </Button>
        </div>
      )}
      <div ref={feed} className="wechat-moments-feed">
        {moments.toReversed().map((moment) => {
          const comments = moment.comments.slice(-3);
          return (
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
              {comments.length ? (
                <div className="wechat-moment-comment-panel">
                  {comments.map((comment) => (
                    <MomentCommentView
                      key={comment.id}
                      moment={moment}
                      comment={comment}
                      state={state}
                    />
                  ))}
                </div>
              ) : null}
              <Button
                className="wechat-moment-more"
                onClick={() => navigation.push({ page: "moment-detail", scopeId, id: moment.id })}
              >
                {moment.comments.length > 3 ? `查看全部 ${moment.comments.length} 条评论` : "评论"}
              </Button>
            </article>
          );
        })}
      </div>
    </Page>
  );
}
