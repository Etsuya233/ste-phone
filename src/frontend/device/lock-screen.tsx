import { useLayoutEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { useUnlockSwipe } from "./use-unlock-swipe.ts";
import type { WallpaperSnapshot } from "../../apps/settings/public.ts";
import { StatusBar } from "../system/status-bar.tsx";
import { useLocalTime } from "../system/use-local-time.ts";

export function LockScreen({
  wallpaper,
  onUnlock,
  unlocking,
  onUnlockEnd,
}: {
  wallpaper: WallpaperSnapshot;
  onUnlock: () => void;
  unlocking: boolean;
  onUnlockEnd: () => void;
}) {
  const now = useLocalTime(true);
  const surface = useRef<HTMLDivElement>(null);
  const swipe = useUnlockSwipe(surface, onUnlock);
  useLayoutEffect(() => surface.current!.focus({ preventScroll: true }), []);
  return (
    <div
      ref={surface}
      className={`lock-screen ${swipe.dragging ? "lock-screen--dragging" : ""}`}
      role="button"
      tabIndex={0}
      aria-label="锁屏，向右滑动或按 Enter 解锁"
      style={{ "--unlock-offset": `${swipe.offset}px` } as CSSProperties}
      inert={unlocking}
      onTransitionEnd={(event) => {
        if (event.target === event.currentTarget && event.propertyName === "opacity") {
          onUnlockEnd();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
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
            <span className="lock-screen-arrow">›</span>滑动来解锁
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
