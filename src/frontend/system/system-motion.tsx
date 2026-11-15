import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";

const SystemMotion = createContext(false);
const reducedMotion = "(prefers-reduced-motion: reduce)";

function listenToReducedMotion(change: () => void) {
  const preference = matchMedia(reducedMotion);
  preference.addEventListener("change", change);
  return () => preference.removeEventListener("change", change);
}

export function useSystemMotionEnabled(enabled: boolean): boolean {
  const reduce = useSyncExternalStore(
    listenToReducedMotion,
    () => matchMedia(reducedMotion).matches,
  );
  return enabled && !reduce;
}

export function SystemMotionProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return <SystemMotion value={enabled}>{children}</SystemMotion>;
}

export function useSystemMotion(): boolean {
  return useContext(SystemMotion);
}
