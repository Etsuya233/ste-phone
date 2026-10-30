import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, HTMLAttributes } from "react";
import { Home } from "../apps/home/home.tsx";
import { Stopwatch } from "../apps/stopwatch/stopwatch.tsx";
import { StatusBar } from "../system/status-bar.tsx";
type Transition = "entering" | "leaving" | null;
export function PhoneDevice({
  scale,
  draggable,
  ...dragEvents
}: Pick<
  HTMLAttributes<HTMLDivElement>,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onLostPointerCapture"
> & { scale: number; draggable: boolean }) {
  const screen = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<"home" | "stopwatch">("home");
  const [transition, setTransition] = useState<Transition>(null);
  const [origin, setOrigin] = useState("50% 90%");
  useEffect(() => {
    if (transition) return;
    const target = page === "home" ? ".home-app" : ".ios-nav button";
    screen.current!.querySelector<HTMLButtonElement>(target)!.focus({ preventScroll: true });
  }, [page, transition]);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const finish = () => {
      if (!preference.matches) return;
      if (transition === "leaving") setPage("home");
      setTransition(null);
    };
    preference.addEventListener("change", finish);
    return () => preference.removeEventListener("change", finish);
  }, [transition]);
  const open = (event: MouseEvent<HTMLButtonElement>) => {
    if (transition) return;
    const icon = event.currentTarget.querySelector(".ios-icon")!.getBoundingClientRect();
    const bounds = screen.current!.getBoundingClientRect();
    setOrigin(
      `${(icon.left + icon.width / 2 - bounds.left) / scale}px ${(icon.top + icon.height / 2 - bounds.top) / scale}px`,
    );
    setPage("stopwatch");
    setTransition(matchMedia("(prefers-reduced-motion: reduce)").matches ? null : "entering");
  };
  const exit = () => {
    if (transition || page === "home") return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) setPage("home");
    else setTransition("leaving");
  };
  return (
    <div className="phone-device">
      <span className="device-mute" aria-hidden="true" />
      <span className="device-volume device-volume--up" aria-hidden="true" />
      <span className="device-volume device-volume--down" aria-hidden="true" />
      <span className="device-power" aria-hidden="true" />
      <div
        className={`device-top ${draggable ? "device-top--draggable" : ""}`}
        aria-hidden="true"
        {...dragEvents}
      >
        <span className="device-camera" />
        <span className="device-speaker" />
      </div>
      <div ref={screen} className="phone-screen">
        <div className="system-workspace">
          <div
            className={`home-layer ${page === "stopwatch" ? "home-layer--covered" : ""}`}
            inert={page !== "home"}
          >
            <Home onOpen={open} />
          </div>
          {page === "stopwatch" ? (
            <div
              className={`app-layer ${transition ? `app-layer--${transition}` : ""}`}
              style={{ "--app-origin": origin } as CSSProperties}
              onAnimationEnd={(event) => {
                if (event.target !== event.currentTarget) return;
                if (transition === "leaving") setPage("home");
                setTransition(null);
              }}
              inert={transition !== null}
            >
              <Stopwatch active={transition !== "leaving"} onExit={exit} />
            </div>
          ) : null}
        </div>
        <StatusBar light={page === "home"} />
        <div className="software-home">
          <button aria-label="返回主屏幕" onClick={exit}>
            <span />
          </button>
        </div>
      </div>
      <div className="device-bottom">
        <button className="device-home" aria-label="返回主屏幕" onClick={exit} />
      </div>
    </div>
  );
}
