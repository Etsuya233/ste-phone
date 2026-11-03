import { Button } from "../../../frontend/foundation/button.tsx";
import type { WechatMemoryBarrier as Barrier } from "../wechat.ts";

export function WechatMemoryBarrier({
  barrier,
  effective,
  position,
  onMenu,
}: {
  barrier: Barrier;
  effective: boolean;
  position: number;
  onMenu(): void;
}) {
  const state = !barrier.enabled ? "off" : effective ? "effective" : "superseded";
  const status = state === "effective" ? "生效中" : state === "off" ? "已关闭" : "由下方接管";
  const range =
    state !== "effective"
      ? null
      : position === 0
        ? "屏障位于首条消息前 · 不排除微信消息"
        : `AI 从此处往后读取 · 之前 ${position} 条不计入`;
  const location = position === 0 ? "首条消息前" : `第 ${position} 条消息后`;
  return (
    <div
      className={`wechat-memory-barrier wechat-memory-barrier--${state}`}
      data-barrier-id={barrier.id}
      tabIndex={-1}
    >
      <div className="wechat-memory-row">
        <span className="wechat-memory-rule" aria-hidden="true" />
        <Button
          className="wechat-memory-pill"
          aria-label={`记忆屏障，${location}，${status}`}
          aria-haspopup="dialog"
          onClick={onMenu}
        >
          <span className="wechat-memory-dot" aria-hidden="true" />
          <span className="wechat-memory-label">记忆屏障</span>
          <span className="wechat-memory-status" aria-live="polite">
            {status}
          </span>
        </Button>
        <span className="wechat-memory-rule" aria-hidden="true" />
      </div>
      {range ? <p className="wechat-memory-detail">{range}</p> : null}
    </div>
  );
}
