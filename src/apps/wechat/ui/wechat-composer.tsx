import type { RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { WechatStickerPanel } from "./wechat-sticker-panel.tsx";
import type { WechatStickerLibrary } from "../wechat-sticker-library.ts";
import type { WechatStickerPack } from "../wechat-stickers.ts";

const MIN_HEIGHT = 38;
const MAX_HEIGHT = 96;

// 输入框随内容长高，底栏高度以实际渲染结果为准，超过上限后改为内部滚动。
export function WechatComposer({
  value,
  disabled,
  replying,
  onStop,
  delayed,
  onQueue,
  onChange,
  onSend,
  onHeightChange,
  packs,
  stickers,
  onSendSticker,
  onManageStickers,
}: {
  value: string;
  disabled: boolean;
  replying: boolean;
  onStop(): void;
  delayed: boolean;
  onQueue(): void;
  onChange(value: string): void;
  onSend(): void;
  onHeightChange(height: number): void;
  packs: readonly WechatStickerPack[];
  stickers: WechatStickerLibrary;
  onSendSticker(marker: string): void;
  onManageStickers(): void;
}) {
  const form = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [showStickers, setShowStickers] = useState(false);
  useComposerHeight(textarea, form, value, onHeightChange);
  return (
    <div ref={form}>
      <form
        className={`wechat-composer ${delayed ? "wechat-composer--delayed" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) {
            onSend();
          }
        }}
      >
        <textarea
          ref={textarea}
          aria-label="消息"
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setShowStickers(false)}
        />
        <button
          type="button"
          className="wechat-sticker-toggle"
          aria-label="表情"
          aria-expanded={showStickers}
          onClick={() => {
            textarea.current!.blur();
            setShowStickers(!showStickers);
          }}
        >
          ☺
        </button>
        {/* 两个动作使用独立节点，避免停止后切回 submit 导致同一次点击提交草稿。 */}
        {replying ? (
          <button key="stop" type="button" onClick={onStop}>
            停止
          </button>
        ) : (
          <button key="send" type="submit" className="wechat-send" disabled={disabled}>
            发送
          </button>
        )}
        {delayed && (
          <button
            type="button"
            className="wechat-queue-message"
            aria-label="加入消息队列"
            disabled={disabled || !value.trim()}
            onClick={onQueue}
          >
            队列
          </button>
        )}
      </form>
      {showStickers && (
        <WechatStickerPanel
          packs={packs}
          stickers={stickers}
          disabled={disabled}
          onSend={onSendSticker}
          onManage={onManageStickers}
        />
      )}
    </div>
  );
}

/** 统一维护输入框增高、底栏测量和隐藏页面的尺寸约定。 */
function useComposerHeight(
  textarea: RefObject<HTMLTextAreaElement | null>,
  form: RefObject<HTMLDivElement | null>,
  value: string,
  onHeightChange: (height: number) => void,
) {
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    const next = Math.min(element.scrollHeight + 2, MAX_HEIGHT);
    element.style.height = `${Math.max(next, MIN_HEIGHT)}px`;
    element.style.overflowY = element.scrollHeight + 2 > MAX_HEIGHT ? "auto" : "hidden";
  }, [value, textarea]);
  useLayoutEffect(() => {
    const element = form.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => {
      // 页面隐藏在导航栈中时尺寸为零，保留上一次的前台高度。
      if (element.offsetHeight > 0) {
        onHeightChange(element.offsetHeight);
      }
    });
    observer.observe(element);
    onHeightChange(element.offsetHeight);
    return () => observer.disconnect();
  }, [onHeightChange, form]);
}
