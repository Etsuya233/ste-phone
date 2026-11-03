import { useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

const FOCUSABLE =
  "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]";

export interface ActionSheetAction {
  readonly label: string;
  readonly onClick: () => void;
  readonly destructive?: boolean;
  readonly disabled?: boolean;
}

export function ActionSheet({
  actions,
  active,
  label = "操作菜单",
  cancelLabel = "取消",
  control,
  onDismiss,
  description,
}: {
  actions: readonly ActionSheetAction[];
  active: boolean;
  label?: string;
  cancelLabel?: string;
  control?: ReactNode;
  onDismiss: () => void;
  description?: string;
}) {
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
      // The underlying Page becomes interactive in the same React commit that removes the sheet.
      queueMicrotask(() => {
        if (previous?.isConnected && !previous.closest("[hidden], [inert], :disabled")) {
          previous.focus({ preventScroll: true });
        }
      });
    };
  }, [active]);
  useLayoutEffect(() => {
    if (active) {
      panel.current!.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }
  }, [active]);

  function choose(action: ActionSheetAction) {
    onDismiss();
    action.onClick();
  }
  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      onDismiss();
    }
  }
  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDismiss();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = [...panel.current!.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    const focused = (panel.current!.getRootNode() as ShadowRoot).activeElement;
    if (event.shiftKey && focused === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && focused === last) {
      event.preventDefault();
      first.focus();
    }
  }

  // Keep the sheet in the App's coordinate space so device scaling and Expose remain intact.
  return (
    <div className="ios-action-sheet-layer" onClick={handleBackdrop} onKeyDown={handleKey}>
      <div
        ref={panel}
        className="ios-action-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
      >
        {description ? <p className="ios-action-sheet-description">{description}</p> : null}
        {control ? (
          <div className="ios-action-sheet-group ios-action-sheet-control">{control}</div>
        ) : null}
        <div className="ios-action-sheet-group">
          {actions.map((action) => (
            <button
              type="button"
              key={action.label}
              className={`ios-action-sheet-action${action.destructive ? " ios-action-sheet-action--destructive" : ""}`}
              disabled={action.disabled}
              onClick={() => choose(action)}
            >
              {action.label}
            </button>
          ))}
        </div>
        <div className="ios-action-sheet-group">
          <button
            type="button"
            className="ios-action-sheet-action ios-action-sheet-action--cancel"
            onClick={onDismiss}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
