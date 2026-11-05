import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type ScreenLock = "unlocked" | "asleep" | "locked" | "unlocking";

/** Locking hides the existing session; it never quits or recreates an app. */
export function useScreenLock(screen: RefObject<HTMLDivElement | null>, visible: boolean) {
  const [state, setState] = useState<ScreenLock>("unlocked");
  const previousFocus = useRef<HTMLElement | null>(null);
  const power = useCallback(() => {
    if (state === "unlocked") {
      // Power buttons preserve pointer focus until this snapshot; unlocking restores the editor.
      const focused = screen.current!.getRootNode() as ShadowRoot;
      previousFocus.current = focused.activeElement as HTMLElement | null;
      previousFocus.current?.blur();
    }
    setState(state === "asleep" ? "locked" : "asleep");
  }, [screen, state]);
  const unlock = useCallback(() => {
    setState((current) =>
      current === "locked"
        ? matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "unlocked"
          : "unlocking"
        : current,
    );
  }, []);
  // A late transition event cannot wake a screen that the user has already put back to sleep.
  const finishUnlock = useCallback(
    () => setState((current) => (current === "unlocking" ? "unlocked" : current)),
    [],
  );
  const wake = useCallback(() => setState("locked"), []);
  useEffect(() => {
    if (state !== "unlocking") {
      return;
    }
    if (!visible) {
      finishUnlock();
      return;
    }
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const settle = () => {
      if (motion.matches) {
        finishUnlock();
      }
    };
    settle();
    motion.addEventListener("change", settle);
    return () => motion.removeEventListener("change", settle);
  }, [state, visible, finishUnlock]);
  useLayoutEffect(() => {
    if (visible && state === "unlocked" && previousFocus.current) {
      previousFocus.current.focus({ preventScroll: true });
      previousFocus.current = null;
    }
  }, [visible, state]);
  return { state, power, wake, unlock, finishUnlock };
}
