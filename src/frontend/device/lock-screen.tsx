import { useLayoutEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { useUnlockSwipe } from "./use-unlock-swipe.ts";
import type { DeviceModel, WallpaperSnapshot } from "../../apps/settings/public.ts";
import { StatusBar } from "../system/status-bar.tsx";
import { useLocalTime } from "../system/use-local-time.ts";

export function LockScreen({
  deviceModel,
  wallpaper,
  onUnlock,
  unlocking,
  onUnlockEnd,
}: {
  deviceModel: DeviceModel;
  wallpaper: WallpaperSnapshot;
  onUnlock: () => void;
  unlocking: boolean;
  onUnlockEnd: () => void;
}) {
  const now = useLocalTime(true);
  const surface = useRef<HTMLDivElement>(null);
  const modern = deviceModel === "iphone-17";
  const swipe = useUnlockSwipe(surface, modern, onUnlock);
  useLayoutEffect(() => {
    if (modern) {
      surface.current!.focus({ preventScroll: true });
      return;
    }
    // Keep a held Home focused while waking; a new lock starts at the visible Home.
    const root = surface.current!.getRootNode() as ShadowRoot;
    const home = [
      ...root.querySelectorAll<HTMLButtonElement>(".software-home-button, .device-home"),
    ].find((button) => button.getClientRects().length > 0);
    home!.focus({ preventScroll: true });
  }, [modern]);
  return (
    <div
      ref={surface}
      className={`lock-screen ${swipe.dragging ? "lock-screen--dragging" : ""}`}
      role={modern ? "button" : "region"}
      tabIndex={modern ? 0 : -1}
      aria-label={modern ? "锁屏，向上滑动或按 Enter 解锁" : "锁屏，长按 Home 解锁"}
      style={{ "--unlock-offset": `${swipe.offset}px` } as CSSProperties}
      inert={unlocking}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "opacity") {
          onUnlockEnd();
        }
      }}
      onKeyDown={(event) => {
        if (modern && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onUnlock();
        }
      }}
      {...swipe.events}
    >
      <div
        className={`phone-wallpaper ${wallpaper.blur ? "phone-wallpaper--blur" : ""}`}
        style={
          wallpaper.wallpaper.kind === "image"
            ? { backgroundImage: `url(${JSON.stringify(wallpaper.url)})` }
            : undefined
        }
      />
      <div className="lock-screen-shade" />
      <StatusBar light active hideTime />
      {/* Only this content follows the gesture; wallpaper and status bar stay anchored. */}
      <div className="lock-screen-content">
        <div className="lock-screen-clock">
          <time dateTime={now.toISOString()}>
            {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
          </time>
          <div>
            {now.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}
          </div>
        </div>
        <div className="lock-screen-hint" aria-hidden="true">
          <span className="lock-screen-shimmer">
            {modern ? <span className="lock-screen-arrow">⌃</span> : null}
            {modern ? "向上滑动解锁" : "长按 Home 解锁"}
          </span>
        </div>
      </div>
    </div>
  );
}

export function SleepingScreen({ onWake }: { onWake: () => void }) {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => button.current!.focus({ preventScroll: true }), []);
  return (
    <button
      ref={button}
      type="button"
      className="sleeping-screen"
      aria-label="屏幕已熄灭，点击唤醒"
      onClick={onWake}
    />
  );
}
