import { useEffect, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";

/** 区分点击与拖动选字；超过该距离视为拖动。 */
const TAP_SLOP = 6;
/** 等待双击判定结束，避免单击菜单打断双击或三击选词。 */
const OPEN_DELAY = 350;

/**
 * 点击消息气泡打开操作菜单，同时保留选择文字和复制。拖动、按下前已有选区、
 * 双击或三击选词时不打开；单击延迟到双击判定结束后再打开。
 */
export function WechatMessageBubble({
  index,
  onMenu,
  children,
}: {
  index: number;
  onMenu(): void;
  children: ReactNode;
}) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const selectionBeforePress = useRef(false);
  const openTimer = useRef<number | null>(null);
  const cancelOpen = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelOpen.current?.(), []);

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    const bubble = event.currentTarget;
    const start = pointerStart.current;
    const dragged =
      start !== null && Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP;
    const selected = selectionBeforePress.current;
    pointerStart.current = null;
    selectionBeforePress.current = false;
    if (event.detail > 0 && (dragged || selected)) {
      return;
    }
    cancelOpen.current?.();
    if (event.detail > 1) {
      return;
    }
    const selection = window.getSelection();
    if (selection && selection.toString()) {
      return;
    }
    const open = () => {
      cancelOpen.current?.();
      const current = window.getSelection();
      if (current && current.toString()) {
        return;
      }
      bubble
        .querySelector<HTMLButtonElement>(".wechat-message-menu")
        ?.focus({ preventScroll: true });
      onMenu();
    };
    if (event.detail === 0) {
      open();
      return;
    }
    const cancel = () => {
      if (openTimer.current !== null) {
        window.clearTimeout(openTimer.current);
        openTimer.current = null;
      }
      document.removeEventListener("pointerdown", cancel, true);
      cancelOpen.current = null;
    };
    cancelOpen.current = cancel;
    document.addEventListener("pointerdown", cancel, true);
    openTimer.current = window.setTimeout(open, OPEN_DELAY);
  }

  return (
    <div
      className="wechat-message-bubble"
      onPointerDown={(event) => {
        pointerStart.current = { x: event.clientX, y: event.clientY };
        const selection = window.getSelection();
        selectionBeforePress.current = !!selection && !!selection.toString();
      }}
      onClick={handleClick}
    >
      {children}
      <Button
        className="wechat-message-menu"
        aria-label={`消息 ${index + 1} 操作`}
        aria-haspopup="dialog"
      />
    </div>
  );
}
