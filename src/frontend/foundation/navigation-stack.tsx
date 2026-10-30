import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

export interface Navigation<T> {
  push: (route: T) => void;
  pop: () => void;
  current: boolean;
}

/** Each entry owns its DOM and scroll position until a completed pop removes it. */
export function NavigationStack<T>({
  initialRoutes,
  active,
  children,
}: {
  initialRoutes: T[];
  active: boolean;
  children: (route: T, navigation: Navigation<T>) => ReactNode;
}) {
  const [entries, setEntries] = useState(() =>
    initialRoutes.map((route, id) => ({ route, id, focus: null as HTMLElement | null })),
  );
  const [motion, setMotion] = useState<"push" | "pop" | null>(null);
  const nextId = useRef(initialRoutes.length);
  const element = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<HTMLElement | null>(null);
  const locked = useRef(false);
  const finish = () => {
    if (motion === "pop") {
      pendingFocus.current = entries.at(-1)!.focus;
      setEntries((previous) => previous.slice(0, -1));
    }
    locked.current = false;
    setMotion(null);
  };
  useEffect(() => {
    if (!active && motion) finish();
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      if (preference.matches && motion) finish();
    };
    preference.addEventListener("change", change);
    return () => preference.removeEventListener("change", change);
  }, [active, motion, entries]);
  useLayoutEffect(() => {
    if (!active || motion) return;
    const top = element.current!.querySelector<HTMLElement>(".navigation-entry--current")!;
    const remembered = pendingFocus.current;
    // A route may replace its list with SQL while returning from an object detail.
    const target =
      remembered && top.contains(remembered) && !remembered.closest("[hidden], [inert], :disabled")
        ? remembered
        : top.querySelector<HTMLElement>(".ios-nav button, button, input");
    target?.focus({ preventScroll: true });
    pendingFocus.current = null;
  }, [active, motion, entries.length]);
  const push = (route: T) => {
    if (locked.current || !active) return;
    locked.current = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    const focus = element.current!.getRootNode() as ShadowRoot;
    setEntries((previous) => [
      ...previous,
      { route, id: nextId.current++, focus: focus.activeElement as HTMLElement | null },
    ]);
    setMotion(locked.current ? "push" : null);
  };
  const pop = () => {
    if (locked.current || !active || entries.length === 1) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      pendingFocus.current = entries.at(-1)!.focus;
      setEntries((previous) => previous.slice(0, -1));
    } else {
      locked.current = true;
      setMotion("pop");
    }
  };
  return (
    <div
      ref={element}
      className={`navigation-stack ${motion ? `navigation-stack--${motion}` : ""}`}
    >
      {entries.map((entry, index) => {
        const current = index === entries.length - 1;
        const beneath = index === entries.length - 2;
        return (
          <div
            key={entry.id}
            className={`navigation-entry ${current ? "navigation-entry--current" : ""} ${beneath ? "navigation-entry--beneath" : ""}`}
            hidden={!current && !(beneath && motion)}
            inert={!active || !current || motion !== null}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget && current && motion) finish();
            }}
          >
            {children(entry.route, { push, pop, current: active && current && motion === null })}
          </div>
        );
      })}
    </div>
  );
}
