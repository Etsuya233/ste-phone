import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type ScreenLock = "unlocked" | "asleep" | "locked";

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
  const unlock = useCallback(() => setState("unlocked"), []);
  const wake = useCallback(() => setState("locked"), []);
  useLayoutEffect(() => {
    if (visible && state === "unlocked" && previousFocus.current) {
      previousFocus.current.focus({ preventScroll: true });
      previousFocus.current = null;
    }
  }, [visible, state]);
  return { state, power, wake, unlock };
}
