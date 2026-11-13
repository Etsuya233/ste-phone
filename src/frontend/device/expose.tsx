import { useEffect, useLayoutEffect, useRef } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { appNames } from "./app-session.ts";
import type { AppId } from "./app-session.ts";
import { AppIcon } from "../system/app-icon.tsx";
import { exposeSwipeSteps, placeExposeCard } from "./expose-layout.ts";
import type { ExposeDrag, ExposeLayout } from "./expose-layout.ts";
import { HomeSwipeMotion } from "./home-swipe-motion.ts";
interface Gesture {
  pointer: number;
  x: number;
  y: number;
  axis: "x" | "y" | null;
  app: AppId | null;
  dx: number;
  dy: number;
  motion: HomeSwipeMotion;
}

/** The gesture layer is separate from the retained, inert application pages below it. */
export function Expose({
  apps,
  selectedIndex,
  layout,
  drag,
  deviceScale,
  visible,
  blocked,
  quitting,
  leaving,
  onDrag,
  onSelect,
  onOpen,
  onQuit,
  onLeaveEnd,
}: {
  apps: AppId[];
  selectedIndex: number;
  layout: ExposeLayout;
  drag: ExposeDrag;
  deviceScale: number;
  visible: boolean;
  blocked: boolean;
  quitting: AppId | null;
  leaving: boolean;
  onDrag: (drag: ExposeDrag) => void;
  onSelect: (index: number) => void;
  onOpen: (app: AppId) => void;
  onQuit: (app: AppId) => void;
  onLeaveEnd: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const selected = apps[selectedIndex];
  useLayoutEffect(() => {
    if (!visible || blocked) {
      return;
    }
    const target = selected
      ? element.current!.querySelector<HTMLButtonElement>(
          `.expose-preview[data-expose-app="${selected}"]`,
        )!
      : element.current!;
    target.focus({ preventScroll: true });
  }, [visible, blocked, selected, apps.length]);
  useEffect(() => {
    if (visible && !blocked) {
      return;
    }
    gesture.current = null;
    onDrag({ x: 0, y: 0, app: null });
  }, [visible, blocked, onDrag, layout.arrangement]);
  const select = (index: number) => onSelect(Math.max(0, Math.min(apps.length - 1, index)));
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (blocked || !event.isPrimary || event.button !== 0) {
      return;
    }
    const app = (event.target as HTMLElement).closest<HTMLElement>("[data-expose-app]")?.dataset
      .exposeApp as AppId | undefined;
    gesture.current = {
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      axis: null,
      app: app ?? null,
      dx: 0,
      dy: 0,
      motion: new HomeSwipeMotion({ x: 0, y: 0, time: event.timeStamp }),
    };
    suppressClick.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) {
      return;
    }
    current.dx = (event.clientX - current.x) / deviceScale;
    current.dy = (event.clientY - current.y) / deviceScale;
    current.motion.record({ x: current.dx, y: current.dy, time: event.timeStamp });
    if (!current.axis && Math.max(Math.abs(current.dx), Math.abs(current.dy)) > 8) {
      current.axis = Math.abs(current.dx) > Math.abs(current.dy) ? "x" : "y";
    }
    const travel = current.dx * layout.direction;
    const edge = Math.max(
      -(apps.length - 1 - selectedIndex) * layout.stride,
      Math.min(selectedIndex * layout.stride, travel),
    );
    onDrag({
      x: current.axis === "x" ? (edge + (travel - edge) * 0.3) * layout.direction : 0,
      y: current.axis === "y" ? Math.min(0, current.dy) : 0,
      app: current.app,
    });
  };
  const end = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) {
      return;
    }
    gesture.current = null;
    onDrag({ x: 0, y: 0, app: null });
    if (current.axis === "x") {
      const distance = (event.clientX - current.x) / deviceScale;
      const velocity = current.motion.release(
        { x: distance, y: (event.clientY - current.y) / deviceScale, time: event.timeStamp },
        "horizontal",
      );
      select(selectedIndex + exposeSwipeSteps(layout, distance, velocity));
    } else if (current.axis === "y" && current.dy <= -90 && current.app) {
      onQuit(current.app);
    } else if (!current.axis && current.app) {
      onOpen(current.app);
    }
  };
  return (
    <div
      ref={element}
      className={`expose ${leaving ? "expose--leaving" : ""}`}
      role="region"
      aria-label="后台应用"
      aria-roledescription="轮播"
      tabIndex={-1}
      inert={!visible || blocked}
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => {
        gesture.current = null;
        onDrag({ x: 0, y: 0, app: null });
      }}
      onLostPointerCapture={() => {
        if (gesture.current) {
          gesture.current = null;
          onDrag({ x: 0, y: 0, app: null });
        }
      }}
      onClickCapture={(event) => {
        if (suppressClick.current && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      }}
      onKeyDown={(event) => {
        if (!apps.length || blocked) {
          return;
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          select(selectedIndex + (event.key === "ArrowRight" ? 1 : -1) * layout.direction);
        } else if (event.key === "Delete") {
          event.preventDefault();
          onQuit(selected!);
        }
      }}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget && leaving) {
          onLeaveEnd();
        }
      }}
    >
      {apps.map((app, index) => {
        const current = selectedIndex === index;
        const card = placeExposeCard(layout, index, selectedIndex, drag.x);
        return (
          <div
            key={app}
            className={`expose-item ${quitting === app ? "expose-item--quitting" : ""}`}
            aria-hidden={!current}
            style={
              {
                width: card.width,
                height: card.height + (layout.arrangement === "carousel" ? 104 : 0),
                left: card.left,
                top: card.top + (drag.app === app ? drag.y : 0),
                zIndex: card.zIndex,
              } as CSSProperties
            }
          >
            <button
              className="expose-preview"
              data-expose-app={app}
              tabIndex={current ? 0 : -1}
              aria-label={`打开${appNames[app]}预览`}
              aria-current={current ? "true" : undefined}
              style={layout.arrangement === "carousel" ? { height: card.height } : undefined}
              onClick={() => onOpen(app)}
            />
            <button
              className="expose-app-icon"
              data-expose-app={app}
              tabIndex={current ? 0 : -1}
              onClick={() => onOpen(app)}
              aria-label={`打开${appNames[app]}`}
            >
              <AppIcon app={app} />
              <span>{appNames[app]}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
