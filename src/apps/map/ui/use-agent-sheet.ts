import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

export type AgentSheetSize = "collapsed" | "half" | "full";

/** 半展开占手机可用高度的 52%，用于首次尚未测量容器高度时。 */
const HALF_RATIO = 0.52;

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

  useLayoutEffect(() => {
    const container = panelRef.current?.parentElement;
    if (!container) {
      return;
    }
    const update = () => setContainerHeight(container.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

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
      ["half", container * HALF_RATIO],
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
              : `${containerHeight * HALF_RATIO}px`
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
