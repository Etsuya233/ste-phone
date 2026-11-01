import { useId, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export function Alert({
  title,
  children,
  active,
  busy = false,
  actions,
  onDismiss,
}: {
  title: string;
  children: ReactNode;
  active: boolean;
  busy?: boolean;
  actions: { label: string; onClick: () => void; primary?: boolean }[];
  onDismiss: () => void;
}) {
  const titleId = useId();
  const messageId = useId();
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!active) {
      return;
    }
    const element = panel.current!;
    const root = element.getRootNode() as ShadowRoot;
    const previous = root.activeElement as HTMLElement | null;
    return () => {
      if (!element.contains(root.activeElement)) {
        return;
      }
      // The underlying Page becomes interactive in the same React commit that removes the alert.
      queueMicrotask(() => {
        if (previous?.isConnected && !previous.closest("[hidden], [inert], :disabled")) {
          previous.focus({ preventScroll: true });
        }
      });
    };
  }, [active]);
  useLayoutEffect(() => {
    if (active) {
      panel.current!.querySelector<HTMLButtonElement>("button")!.focus();
    }
  }, [active, title]);

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
    } else if (event.key === "Tab") {
      const buttons = [...panel.current!.querySelectorAll<HTMLButtonElement>("button")];
      const first = buttons[0]!;
      const last = buttons.at(-1)!;
      const focused = (panel.current!.getRootNode() as ShadowRoot).activeElement;
      if (event.shiftKey && focused === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }

  // Keep the alert in the App's coordinate space so device scaling and Expose remain intact.
  return (
    <div className="ios-alert-overlay" onKeyDown={handleKey}>
      <div
        ref={panel}
        className="ios-alert"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
      >
        <div className="ios-alert-body">
          {busy ? <span className="ios-alert-spinner" aria-hidden="true" /> : null}
          <h2 id={titleId} className="ios-alert-title">
            {title}
          </h2>
          <div id={messageId} className="ios-alert-message" role="status" aria-live="polite">
            {children}
          </div>
        </div>
        <div className="ios-alert-actions">
          {actions.map((action) => (
            <button
              type="button"
              key={action.label}
              className={`ios-alert-action ${action.primary ? "ios-alert-action--primary" : ""}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
