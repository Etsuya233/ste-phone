import type { RefObject } from "react";
import { useLayoutEffect, useRef } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import type { MomentComment } from "../wechat-moments.ts";
import type { WechatSnapshot } from "../wechat.ts";

const MIN_HEIGHT = 36;
const MAX_HEIGHT = 96;

/** 固定底栏承载评论草稿和回复目标，页面正文只负责阅读和评论列表。 */
export function MomentCommentBar({
  text,
  replyTo,
  people,
  error,
  status,
  disabled,
  onTextChange,
  onCancelReply,
  onSubmit,
  onHeightChange,
}: {
  text: string;
  replyTo: MomentComment | null;
  people: WechatSnapshot["people"];
  error: string | null;
  status: "editing" | "saving" | "deleted";
  disabled: boolean;
  onTextChange(text: string): void;
  onCancelReply(): void;
  onSubmit(): void;
  onHeightChange(height: number): void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useAutoGrow(textarea, text);
  useBarHeight(bar, onHeightChange);
  const replyName = replyTo
    ? (people.find((person) => person.id === replyTo.author.id)?.name ?? replyTo.author.name)
    : null;
  return (
    <div ref={bar} className="wechat-moment-comment-bar">
      {replyTo ? (
        <div className="wechat-moment-reply-target">
          <span>回复 {replyName}</span>
          <Button disabled={status !== "editing"} onClick={onCancelReply}>
            取消
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="wechat-moment-comment-error" role="alert">
          {error}
        </p>
      ) : null}
      <form
        className="wechat-moment-comment-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!disabled) {
            onSubmit();
          }
        }}
      >
        <textarea
          ref={textarea}
          rows={1}
          aria-label={replyName ? `回复 ${replyName}` : "评论"}
          placeholder={replyName ? `回复 ${replyName}…` : "说点什么…"}
          value={text}
          disabled={status !== "editing"}
          onChange={(event) => onTextChange(event.target.value)}
        />
        <Button
          type="submit"
          variant="filled"
          className="wechat-moment-primary"
          disabled={disabled || !text.trim()}
        >
          {status === "saving" ? "发送中" : "发送"}
        </Button>
      </form>
    </div>
  );
}

function useAutoGrow(textarea: RefObject<HTMLTextAreaElement | null>, text: string) {
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    const next = Math.min(element.scrollHeight + 2, MAX_HEIGHT);
    element.style.height = `${Math.max(next, MIN_HEIGHT)}px`;
    element.style.overflowY = element.scrollHeight + 2 > MAX_HEIGHT ? "auto" : "hidden";
  }, [text, textarea]);
}

function useBarHeight(
  bar: RefObject<HTMLDivElement | null>,
  onHeightChange: (height: number) => void,
) {
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(() => {
      if (element.offsetHeight > 0) {
        onHeightChange(element.offsetHeight);
      }
    });
    observer.observe(element);
    onHeightChange(element.offsetHeight);
    return () => observer.disconnect();
  }, [bar, onHeightChange]);
}
