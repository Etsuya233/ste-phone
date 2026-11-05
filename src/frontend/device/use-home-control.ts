import { useEffect, useRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import type { DeviceModel } from "../../apps/settings/public.ts";
import type { ScreenLock } from "./use-screen-lock.ts";
import { useHomeSwipe } from "./use-home-swipe.ts";

interface HomeControl {
  deviceModel: DeviceModel;
  visible: boolean;
  sessionKey: string;
  lockState: ScreenLock;
  editingHome: boolean;
  onFinishEditing: () => void;
  wake: () => void;
  unlock: () => void;
  onHome: () => void;
  onExpose: () => void;
}
type Press =
  | { kind: "key"; key: string; consumed: boolean }
  | {
      kind: "pointer";
      id: number;
      x: number;
      y: number;
      scale: number;
      consumed: boolean;
    };

/** One input owns its timers until release; model changes and hiding cancel that ownership. */
export function useHomeControl(options: HomeControl): ButtonHTMLAttributes<HTMLButtonElement> {
  const latest = useRef(options);
  latest.current = options;
  const press = useRef<Press | null>(null);
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const click = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const clearHold = () => {
    if (hold.current !== null) {
      clearTimeout(hold.current);
    }
    hold.current = null;
  };
  const cancel = () => {
    clearHold();
    if (press.current) {
      suppressClick.current = true;
    }
    press.current = null;
  };
  useEffect(() => {
    cancel();
    if (click.current !== null) {
      clearTimeout(click.current);
    }
    click.current = null;
    return () => {
      cancel();
      if (click.current !== null) {
        clearTimeout(click.current);
      }
      click.current = null;
    };
  }, [options.visible, options.deviceModel, options.sessionKey]);
  useEffect(() => {
    const leave = () => {
      cancel();
      if (click.current !== null) {
        clearTimeout(click.current);
      }
      click.current = null;
    };
    const hide = () => {
      if (document.hidden) {
        leave();
      }
    };
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  useEffect(() => {
    // Waking a held 6s Home must preserve its timer; locking cancels a pending navigation click.
    if (options.lockState !== "unlocked" && click.current !== null) {
      clearTimeout(click.current);
      click.current = null;
    }
    if (options.lockState === "asleep") {
      cancel();
    }
  }, [options.lockState]);
  const startClassicHold = () => {
    const current = latest.current;
    if (current.deviceModel !== "iphone-6s" || current.lockState === "unlocked") {
      return;
    }
    if (current.lockState === "asleep") {
      current.wake();
    }
    hold.current = setTimeout(() => {
      hold.current = null;
      if (press.current) {
        press.current.consumed = true;
        suppressClick.current = true;
        latest.current.unlock();
      }
    }, 600);
  };
  const swipe = useHomeSwipe({
    ...options,
    enabled: options.deviceModel === "iphone-17",
    onUnlock: options.unlock,
    consumeClick: () => {
      suppressClick.current = true;
    },
    beginClick: () => {
      suppressClick.current = false;
    },
  });
  return {
    onClick: () => {
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      const current = latest.current;
      if (current.lockState !== "unlocked") {
        if (current.lockState === "asleep") {
          current.wake();
        }
        return;
      }
      if (current.editingHome) {
        current.onFinishEditing();
        return;
      }
      if (click.current !== null) {
        clearTimeout(click.current);
        click.current = null;
        current.onExpose();
      } else {
        click.current = setTimeout(() => {
          click.current = null;
          latest.current.onHome();
        }, 280);
      }
    },
    onPointerDown: (event) => {
      if (!event.isPrimary || event.button !== 0 || !latest.current.visible) {
        return;
      }
      suppressClick.current = false;
      press.current = {
        kind: "pointer",
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scale: event.currentTarget.getBoundingClientRect().width / event.currentTarget.clientWidth,
        consumed: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      startClassicHold();
    },
    onPointerMove: (event) => {
      const current = press.current;
      if (current?.kind !== "pointer" || current.id !== event.pointerId || current.consumed) {
        return;
      }
      const horizontal = Math.abs(event.clientX - current.x) / current.scale;
      const upward = (current.y - event.clientY) / current.scale;
      if (horizontal > 12 || Math.abs(upward) > 12) {
        cancel();
      }
    },
    onPointerUp: (event) => {
      const current = press.current;
      if (current?.kind !== "pointer" || current.id !== event.pointerId) {
        return;
      }
      clearHold();
      press.current = null;
    },
    onPointerCancel: cancel,
    onLostPointerCapture: cancel,
    onKeyDown: (event) => {
      if (event.key !== " " && event.key !== "Enter") {
        return;
      }
      event.preventDefault();
      if (event.repeat || press.current) {
        return;
      }
      suppressClick.current = false;
      press.current = { kind: "key", key: event.key, consumed: false };
      startClassicHold();
    },
    onKeyUp: (event) => {
      const current = press.current;
      if (current?.kind !== "key" || current.key !== event.key) {
        return;
      }
      event.preventDefault();
      clearHold();
      press.current = null;
      if (!current.consumed) {
        event.currentTarget.click();
      }
    },
    ...(options.deviceModel === "iphone-17" ? swipe : {}),
    onBlur: (event) => {
      cancel();
      if (click.current !== null) {
        clearTimeout(click.current);
      }
      click.current = null;
      if (options.deviceModel === "iphone-17") {
        swipe.onBlur?.(event);
      }
    },
  };
}
