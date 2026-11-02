import { useEffect, useLayoutEffect, useState } from "react";
import type { RefObject } from "react";

interface Viewport {
  width: number;
  height: number;
  left: number;
  top: number;
}

function readViewport() {
  const visual = window.visualViewport;
  return {
    layout: { width: window.innerWidth, height: window.innerHeight },
    visible: {
      width: visual?.width ?? window.innerWidth,
      height: visual?.height ?? window.innerHeight,
      left: visual?.offsetLeft ?? 0,
      top: visual?.offsetTop ?? 0,
    },
    keyboard: false,
  };
}

function focusedEditor(panel: HTMLDialogElement): HTMLElement | null {
  const active = (panel.getRootNode() as ShadowRoot).activeElement;
  if (!(active instanceof HTMLElement) || !panel.contains(active)) {
    return null;
  }
  if (active.isContentEditable) {
    return active;
  }
  if (
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement &&
      ["text", "search", "email", "number", "password", "tel", "url"].includes(active.type))
  ) {
    return active.readOnly || active.disabled ? null : active;
  }
  return null;
}

export function usePhoneViewport(panel: RefObject<HTMLDialogElement | null>, open: boolean) {
  const [viewport, setViewport] = useState(readViewport);
  useEffect(() => {
    let frame: number | null = null;
    const update = () => {
      frame = null;
      const measured = readViewport();
      const editing = open && focusedEditor(panel.current!) !== null;
      setViewport((previous) => {
        // 部分移动浏览器连布局视口也随键盘缩小。保留输入前尺寸直到键盘收起；
        // 宽度改变（旋转屏幕）立即采用新布局，桌面窗口调整始终正常生效。
        const preserveLayout =
          window.matchMedia("(pointer: coarse)").matches &&
          (editing || previous.keyboard) &&
          measured.layout.width === previous.layout.width &&
          measured.layout.height < previous.layout.height;
        const layout = preserveLayout ? previous.layout : measured.layout;
        return {
          layout,
          visible: measured.visible,
          keyboard: (editing || previous.keyboard) && measured.visible.height < layout.height - 1,
        };
      });
    };
    const schedule = () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(update);
    };
    const element = panel.current!;
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    // Shadow DOM 的 document.activeElement 是宿主，须从本树读取真实输入焦点。
    // 延至下一帧读取，覆盖输入框之间切换和 textarea 随内容增高后的最终布局。
    element.addEventListener("focusin", schedule);
    element.addEventListener("focusout", schedule);
    element.addEventListener("input", schedule);
    schedule();
    return () => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      element.removeEventListener("focusin", schedule);
      element.removeEventListener("focusout", schedule);
      element.removeEventListener("input", schedule);
    };
  }, [open, panel]);
  return viewport;
}

function scrollEditorIntoPage(editor: HTMLElement, panel: HTMLDialogElement, scale: number) {
  for (
    let parent = editor.parentElement;
    parent && parent !== panel;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent);
    if (!/(auto|scroll)/.test(style.overflowY) || parent.scrollHeight <= parent.clientHeight) {
      continue;
    }
    // scroll-padding 与 Page 顶栏、底栏共用高度。只滚动手机内的真实滚动层，
    // 不让 scrollIntoView 顺带移动 ST 文档或保活的隐藏导航页。
    const bounds = parent.getBoundingClientRect();
    // CSS 的 auto 由浏览器决定留白，此处按零额外留白计算。
    const paddingTop = style.scrollPaddingTop === "auto" ? 0 : parseFloat(style.scrollPaddingTop);
    const paddingBottom =
      style.scrollPaddingBottom === "auto" ? 0 : parseFloat(style.scrollPaddingBottom);
    const top = bounds.top + (parent.clientTop + paddingTop) * scale;
    const bottom = bounds.top + (parent.clientTop + parent.clientHeight - paddingBottom) * scale;
    const input = editor.getBoundingClientRect();
    const movement = input.top < top ? input.top - top : Math.max(0, input.bottom - bottom);
    parent.scrollTop += movement / scale;
  }
}

export function usePhoneInputVisibility(
  panel: RefObject<HTMLDialogElement | null>,
  open: boolean,
  viewport: Viewport,
  scale: number,
) {
  useLayoutEffect(() => {
    const element = panel.current!;
    const reveal = () => {
      // 每次从未偏移的位置重新测量；键盘收起、失焦和关闭都不会积累位移。
      element.style.removeProperty("--phone-input-offset");
      const editor = open ? focusedEditor(element) : null;
      if (!editor) {
        return;
      }
      scrollEditorIntoPage(editor, element, scale);
      // Safari 在键盘平移视口后，client rect 可能已扣除了该平移量。
      // 用同一 fixed dialog 的实际位置与 CSS top 校准客户区原点，
      // 再转换可见区域，避免把 offsetTop 重复加到输入框的坐标中。
      const clientOrigin =
        element.getBoundingClientRect().top - parseFloat(getComputedStyle(element).top);
      const bounds = editor.getBoundingClientRect();
      const top = clientOrigin + viewport.top + 8;
      const bottom = clientOrigin + viewport.top + viewport.height - 8;
      const offset = bounds.top < top ? top - bounds.top : Math.min(0, bottom - bounds.bottom);
      element.style.setProperty("--phone-input-offset", `${offset}px`);
    };
    reveal();
    const editor = open ? focusedEditor(element) : null;
    const observer = new ResizeObserver(reveal);
    if (editor) {
      observer.observe(editor);
    }
    return () => {
      observer.disconnect();
      element.style.removeProperty("--phone-input-offset");
    };
  }, [open, panel, viewport, scale]);
}
