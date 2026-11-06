import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type AgentSheetSize = "collapsed" | "half" | "full";

/** 半展开占手机可用高度的 44%，给地图留出主体视野；首次尚未测量容器高度时使用。 */
const HALF_RATIO = 0.44;
/** 标题栏和输入区之外至少保留的对话高度，短屏幕上避免半屏被内容挤没。 */
const MIN_BODY_HEIGHT = 44;

export function useAgentSheet() {
  const panelRef = useRef<HTMLElement>(null);
  const drag = useRef<{
    startY: number;
    startHeight: number;
    minHeight: number;
    moved: boolean;
    height: number;
  } | null>(null);
  const [size, setSize] = useState<AgentSheetSize>("half");
  const [height, setHeight] = useState<number | null>(null);
  const [containerHeight, setContainerHeight] = useState<number | null>(null);
  const [chromeHeight, setChromeHeight] = useState(0);
  const composerHeight = useRef(0);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const container = panel?.parentElement;
    if (!panel || !container) {
      return;
    }
    const composer = panel.querySelector<HTMLElement>(".map-agent-composer");
    const update = () => {
      setContainerHeight(container.clientHeight);
      const header = panel.querySelector<HTMLElement>(".map-agent-header")?.offsetHeight ?? 56;
      const safeBottom = Number.parseFloat(getComputedStyle(panel).paddingBottom) || 0;
      // 收起时输入区为 display:none，沿用最后一次可见高度，避免随后展开的半屏过矮。
      const measured = composer?.offsetHeight ?? 0;
      if (measured > 0) {
        composerHeight.current = measured;
      }
      setChromeHeight(header + composerHeight.current + safeBottom);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);

  const halfHeight = (container: number) =>
    Math.min(container, Math.max(container * HALF_RATIO, chromeHeight + MIN_BODY_HEIGHT));

  const collapsedHeight = () => {
    const panel = panelRef.current;
    const header = panel?.querySelector<HTMLElement>(".map-agent-header")?.offsetHeight ?? 56;
    const safeBottom = panel ? Number.parseFloat(getComputedStyle(panel).paddingBottom) || 0 : 0;
    return header + safeBottom;
  };

  const snap = (value: number): AgentSheetSize => {
    const container = panelRef.current?.parentElement?.clientHeight ?? value;
    const targets: [AgentSheetSize, number][] = [
      ["collapsed", collapsedHeight()],
      ["half", halfHeight(container)],
      ["full", container],
    ];
    return targets.reduce((nearest, entry) =>
      Math.abs(entry[1] - value) < Math.abs(nearest[1] - value) ? entry : nearest,
    )[0];
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    const panel = panelRef.current;
    if (event.button !== 0 || !panel || (event.target as HTMLElement).closest("button")) {
      return;
    }
    drag.current = {
      startY: event.clientY,
      startHeight: panel.offsetHeight,
      minHeight: collapsedHeight(),
      moved: false,
      height: panel.offsetHeight,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    const panel = panelRef.current;
    if (!state || !panel) {
      return;
    }
    const delta = state.startY - event.clientY;
    if (!state.moved && Math.abs(delta) < 4) {
      return;
    }
    state.moved = true;
    event.preventDefault();
    const container = panel.parentElement?.clientHeight ?? state.startHeight;
    state.height = Math.min(container, Math.max(state.minHeight, state.startHeight + delta));
    setHeight(state.height);
  };

  const finishDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const state = drag.current;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (!state?.moved) {
      return;
    }
    setHeight(null);
    setSize(snap(state.height));
  };

  const cancelDrag = () => {
    drag.current = null;
    setHeight(null);
  };

  return {
    panelRef,
    size,
    height,
    cssHeight:
      height !== null
        ? `${height}px`
        : size === "full"
          ? "100%"
          : size === "half"
            ? containerHeight === null
              ? `${HALF_RATIO * 100}%`
              : `${halfHeight(containerHeight)}px`
            : "calc(var(--map-agent-collapsed-height) + var(--safe-bottom))",
    toggleFull: () => setSize((current) => (current === "half" ? "full" : "half")),
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: cancelDrag,
    },
  };
}
