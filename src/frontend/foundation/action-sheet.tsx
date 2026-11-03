import { useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, MouseEvent } from "react";

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
  onDismiss,
  description,
}: {
  actions: readonly ActionSheetAction[];
  active: boolean;
  label?: string;
  cancelLabel?: string;
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
      panel.current!.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
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
    const buttons = [
      ...panel.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
    ];
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
