import { useLayoutEffect, useRef } from "react";

const MIN_HEIGHT = 38;
const MAX_HEIGHT = 96;

// 输入框随内容长高，底栏高度以实际渲染结果为准，超过上限后改为内部滚动。
export function WechatComposer({
  value,
  disabled,
  onChange,
  onSend,
  onHeightChange,
}: {
  value: string;
  disabled: boolean;
  onChange(value: string): void;
  onSend(): void;
  onHeightChange(height: number): void;
}) {
  const form = useRef<HTMLFormElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) {
      return;
    }
    element.style.height = "auto";
    const next = Math.min(element.scrollHeight + 2, MAX_HEIGHT);
    element.style.height = `${Math.max(next, MIN_HEIGHT)}px`;
    element.style.overflowY = element.scrollHeight + 2 > MAX_HEIGHT ? "auto" : "hidden";
  }, [value]);
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
  }, [onHeightChange]);
  return (
    <form
      ref={form}
      className="wechat-composer"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <textarea
        ref={textarea}
        aria-label="消息"
        rows={1}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="submit" disabled={disabled || !value.trim()}>
        发送
      </button>
    </form>
  );
}
