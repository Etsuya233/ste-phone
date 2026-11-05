import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import type { ScreenLock } from "./use-screen-lock.ts";
import { HomeSwipeMotion } from "./home-swipe-motion.ts";

const SWIPE_DISTANCE = 70;
const PAUSE_RADIUS = 12;
const EXPOSE_PAUSE_MS = 240;
// Logical pixels per millisecond; device scaling must not change release intent.
const STILL_RELEASE_SPEED = 0.2;

interface HomeSwipe {
  enabled: boolean;
  visible: boolean;
  sessionKey: string;
  lockState: ScreenLock;
  onHome: () => void;
  onExpose: () => void;
  onUnlock: () => void;
  consumeClick: () => void;
  beginClick: () => void;
}

/** Pointer capture starts only on the Home button, leaving app scrolling untouched. */
export function useHomeSwipe(options: HomeSwipe): ButtonHTMLAttributes<HTMLButtonElement> {
  const latest = useRef(options);
  latest.current = options;
  const gesture = useRef<{
    id: number;
    x: number;
    y: number;
    scale: number;
    upward: number;
    consumed: boolean;
    pauseOrigin: { x: number; y: number } | null;
    motion: HomeSwipeMotion;
  } | null>(null);
  const dwell = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearDwell = () => {
    if (dwell.current !== null) {
      clearTimeout(dwell.current);
    }
    dwell.current = null;
  };
  const cancel = () => {
    clearDwell();
    if (gesture.current) {
      latest.current.consumeClick();
    }
    gesture.current = null;
  };
  useEffect(() => {
    cancel();
    return cancel;
  }, [options.enabled, options.visible, options.sessionKey, options.lockState]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        cancel();
      }
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  return {
    onPointerDown: (event) => {
      if (!options.enabled || !options.visible || !event.isPrimary || event.button !== 0) {
        return;
      }
      latest.current.beginClick();
      const scale =
        event.currentTarget.getBoundingClientRect().width / event.currentTarget.clientWidth;
      gesture.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scale,
        upward: 0,
        consumed: false,
        pauseOrigin: null,
        motion: new HomeSwipeMotion({
          x: event.clientX / scale,
          y: event.clientY / scale,
          time: event.timeStamp,
        }),
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId || current.consumed) {
        return;
      }
      const horizontal = Math.abs(event.clientX - current.x) / current.scale;
      current.motion.record({
        x: event.clientX / current.scale,
        y: event.clientY / current.scale,
        time: event.timeStamp,
      });
      const upward = (current.y - event.clientY) / current.scale;
      current.upward = upward > horizontal ? upward : 0;
      if (Math.max(horizontal, Math.abs(upward)) > 8) {
        latest.current.consumeClick();
      }
      // Once raised far enough, small drift across the entry threshold is still a pause.
      const minimumUpward = current.pauseOrigin ? SWIPE_DISTANCE - PAUSE_RADIUS : SWIPE_DISTANCE;
      if (current.upward < minimumUpward || latest.current.lockState !== "unlocked") {
        clearDwell();
        current.pauseOrigin = null;
        return;
      }
      // Fingers drift while held. Keep the pause timer within a logical-pixel radius;
      // continued travel beyond that radius starts a new pause at the current position.
      if (
        current.pauseOrigin &&
        Math.hypot(event.clientX - current.pauseOrigin.x, event.clientY - current.pauseOrigin.y) /
          current.scale <=
          PAUSE_RADIUS
      ) {
        return;
      }
      clearDwell();
      current.pauseOrigin = { x: event.clientX, y: event.clientY };
      dwell.current = setTimeout(() => {
        dwell.current = null;
        if (gesture.current === current && latest.current.lockState === "unlocked") {
          current.consumed = true;
          latest.current.consumeClick();
          latest.current.onExpose();
        }
      }, EXPOSE_PAUSE_MS);
    },
    onPointerUp: (event) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) {
        return;
      }
      clearDwell();
      gesture.current = null;
      if (current.consumed || current.upward < SWIPE_DISTANCE) {
        return;
      }
      latest.current.consumeClick();
      const releaseSpeed = current.motion.release({
        x: event.clientX / current.scale,
        y: event.clientY / current.scale,
        time: event.timeStamp,
      });
      if (latest.current.lockState === "locked") {
        latest.current.onUnlock();
      } else if (latest.current.lockState === "unlocked") {
        // A quiet release expresses the same intent as holding still, without waiting for the timer.
        if (releaseSpeed <= STILL_RELEASE_SPEED) {
          latest.current.onExpose();
        } else {
          latest.current.onHome();
        }
      }
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onBlur: cancel,
  };
}
