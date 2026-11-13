import type { RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { WechatChatAttachments } from "./wechat-chat-attachments.tsx";
import { WechatAddIcon, WechatSmileIcon } from "./wechat-chat-icons.tsx";
import { WechatStickerPanel } from "./wechat-sticker-panel.tsx";
import type { WechatStickerLibrary } from "../wechat-sticker-library.ts";
import type { WechatStickerPack } from "../wechat-stickers.ts";

const MIN_HEIGHT = 40;
const MAX_HEIGHT = 100;
type ComposerPanel = "none" | "stickers" | "attachments";

// 输入框随内容长高，底栏高度以实际渲染结果为准，超过上限后改为内部滚动。
// 表情与附件面板都属于底栏的一部分，打开时由同一个 ResizeObserver 通知页面避让。
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
  onPickImage,
  onPickRedPacket,
  onPickTransfer,
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
  onPickImage(): void;
  onPickRedPacket(): void;
  onPickTransfer(): void;
}) {
  const form = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [panel, setPanel] = useState<ComposerPanel>("none");
  useComposerHeight(textarea, form, value, onHeightChange);
  const toggle = (next: Exclude<ComposerPanel, "none">) => {
    textarea.current?.blur();
    setPanel((current) => (current === next ? "none" : next));
  };
  const pick = (open: () => void) => {
    setPanel("none");
    open();
  };
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
        <button
          type="button"
          className="wechat-composer-icon wechat-attachments-toggle"
          aria-label="添加附件"
          aria-expanded={panel === "attachments"}
          disabled={disabled}
          onClick={() => toggle("attachments")}
        >
          <WechatAddIcon />
        </button>
        <textarea
          ref={textarea}
          aria-label="消息"
          rows={1}
          value={value}
          placeholder="发消息"
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setPanel("none")}
        />
        <button
          type="button"
          className="wechat-composer-icon wechat-sticker-toggle"
          aria-label="表情"
          aria-expanded={panel === "stickers"}
          onClick={() => toggle("stickers")}
        >
          <WechatSmileIcon />
        </button>
        <div className="wechat-composer-actions">
          {/* 停止与发送使用独立节点，避免停止后切回 submit 导致同一次点击提交草稿。 */}
          {replying ? (
            <button key="stop" type="button" className="wechat-stop" onClick={onStop}>
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
        </div>
      </form>
      {panel === "stickers" && (
        <WechatStickerPanel
          packs={packs}
          stickers={stickers}
          disabled={disabled}
          onSend={onSendSticker}
          onManage={onManageStickers}
        />
      )}
      {panel === "attachments" && (
        <WechatChatAttachments
          disabled={disabled}
          onImage={() => pick(onPickImage)}
          onRedPacket={() => pick(onPickRedPacket)}
          onTransfer={() => pick(onPickTransfer)}
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
