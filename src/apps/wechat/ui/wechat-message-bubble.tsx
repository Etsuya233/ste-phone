import { useEffect, useRef } from "react";
import type { MouseEvent, PointerEvent, ReactNode } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";

/** 区分点击与拖动选字；超过该距离视为拖动。 */
const TAP_SLOP = 6;
/** 等待双击判定结束，避免单击菜单打断双击或三击选词。 */
const OPEN_DELAY = 350;
/** 长按与微信一致，作为触摸和鼠标打开消息菜单的直接入口。 */
const LONG_PRESS_DELAY = 480;

/**
 * 点击消息气泡打开操作菜单，同时保留选择文字和复制。拖动、按下前已有选区、
 * 双击或三击选词时不打开；单击延迟到双击判定结束后再打开。
 * 富消息内部已有打开详情的按钮，因此额外提供长按和可见菜单按钮，
 * 保证触摸与鼠标都能打开撤回、删除和记忆屏障操作。
 */
export function WechatMessageBubble({
  index,
  kind,
  onMenu,
  children,
}: {
  index: number;
  kind: "text" | "sticker" | "rich";
  onMenu(): void;
  children: ReactNode;
}) {
  const menu = useRef<HTMLButtonElement>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const selectionBeforePress = useRef(false);
  const openTimer = useRef<number | null>(null);
  const cancelOpen = useRef<(() => void) | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  useEffect(
    () => () => {
      cancelOpen.current?.();
      if (longPressTimer.current !== null) {
        window.clearTimeout(longPressTimer.current);
      }
    },
    [],
  );

  function clearLongPress() {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function openMenu() {
    cancelOpen.current?.();
    const selection = window.getSelection();
    if (selection && selection.toString()) {
      return;
    }
    menu.current?.focus({ preventScroll: true });
    onMenu();
  }
  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    pointerStart.current = { x: event.clientX, y: event.clientY };
    selectionBeforePress.current = !!window.getSelection()?.toString();
    suppressClick.current = false;
    if (kind !== "rich") {
      return;
    }
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      if (window.getSelection()?.toString()) {
        return;
      }
      suppressClick.current = true;
      openMenu();
    }, LONG_PRESS_DELAY);
  }
  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = pointerStart.current;
    if (!start) {
      return;
    }
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP) {
      clearLongPress();
    }
  }
  function handleClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (!suppressClick.current || event.detail === 0) {
      return;
    }
    // 长按已经打开菜单，阻止富消息按钮随后把用户带到详情页。
    event.preventDefault();
    event.stopPropagation();
    suppressClick.current = false;
  }
  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button:not(.wechat-message-menu)")) {
      return;
    }
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
    if (event.detail === 0) {
      openMenu();
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
    openTimer.current = window.setTimeout(openMenu, OPEN_DELAY);
  }

  return (
    <div
      className={`wechat-message-bubble wechat-message-bubble--${kind}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearLongPress}
      onPointerCancel={() => {
        clearLongPress();
        pointerStart.current = null;
      }}
      onPointerLeave={clearLongPress}
      onClickCapture={handleClickCapture}
      onClick={handleClick}
    >
      {children}
      <Button
        ref={menu}
        className="wechat-message-menu"
        aria-label={`消息 ${index + 1} 操作`}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.stopPropagation();
          menu.current?.focus({ preventScroll: true });
          onMenu();
        }}
      />
    </div>
  );
}
