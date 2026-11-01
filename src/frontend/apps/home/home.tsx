import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { MouseEvent, PointerEvent, KeyboardEvent } from "react";
import { AppIcon } from "../../system/app-icon.tsx";
import { appCatalog } from "../../../core/launcher/catalog.ts";
import type { AppId, HomeLayout } from "../../../core/launcher/catalog.ts";
import type { HomeScreenSettings } from "../../../apps/settings/public.ts";
import { Button } from "../../foundation/button.tsx";
import { Icon } from "../../foundation/icon.tsx";
import { Page } from "../../foundation/page.tsx";
import { Text } from "../../foundation/text.tsx";
import { Alert } from "../../foundation/alert.tsx";

type Area = "grid" | "dock";
interface Gesture {
  app: AppId;
  pointerId: number;
  x: number;
  y: number;
  armed: boolean;
  moving: boolean;
  layout: HomeLayout;
}
export function Home({
  onOpen,
  homeScreen,
  active,
  editing,
  onEditingChange,
  onUninstall,
}: {
  onOpen: (event: MouseEvent<HTMLButtonElement>, app: AppId) => void;
  homeScreen: HomeScreenSettings;
  active: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onUninstall: (app: AppId) => void;
}) {
  const saved = useSyncExternalStore(homeScreen.subscribe, homeScreen.getSnapshot);
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const [draft, setDraft] = useState<HomeLayout | null>(null);
  const [floating, setFloating] = useState<{ app: AppId; x: number; y: number } | null>(null);
  const [deleting, setDeleting] = useState<AppId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const layout = draft ?? saved;
  function clearGesture() {
    if (timer.current !== null) {
      clearTimeout(timer.current);
    }
    timer.current = null;
    gesture.current = null;
    setDraft(null);
    setFloating(null);
  }
  useEffect(() => {
    if (!active || !editing) {
      clearGesture();
      setDeleting(null);
      setError(null);
    }
    if (!active) {
      onEditingChange(false);
    }
  }, [active, editing, onEditingChange]);
  useEffect(
    () => () => {
      if (timer.current !== null) {
        clearTimeout(timer.current);
      }
    },
    [],
  );
  function start(event: PointerEvent<HTMLButtonElement>, app: AppId) {
    if (event.button !== 0 || !event.isPrimary) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      app,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      armed: editing,
      moving: false,
      layout: saved,
    };
    if (!editing) {
      timer.current = setTimeout(() => {
        timer.current = null;
        gesture.current!.armed = true;
        suppressClick.current = true;
        onEditingChange(true);
      }, 500);
    }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    const distance = Math.hypot(event.clientX - current.x, event.clientY - current.y);
    if (!current.armed) {
      if (distance > 8) {
        suppressClick.current = true;
        clearGesture();
      }
      return;
    }
    if (!current.moving && distance < 6) {
      return;
    }
    // 跨主屏与 Dock 会重新挂载图标，拖动期间由稳定的桌面节点持有指针。
    if (!current.moving) {
      root.current!.setPointerCapture(event.pointerId);
    }
    current.moving = true;
    suppressClick.current = true;
    const bounds = root.current!.getBoundingClientRect();
    const scale = bounds.width / root.current!.clientWidth;
    setFloating({
      app: current.app,
      x: (event.clientX - bounds.left) / scale,
      y: (event.clientY - bounds.top) / scale,
    });
    for (const area of ["grid", "dock"] as const) {
      const container = root.current!.querySelector<HTMLElement>(`[data-home-area="${area}"]`)!;
      const rect = container.getBoundingClientRect();
      if (
        event.clientY < rect.top ||
        event.clientY > rect.bottom ||
        event.clientX < rect.left ||
        event.clientX > rect.right
      ) {
        continue;
      }
      if (
        area === "dock" &&
        current.layout.dock.length === 4 &&
        !current.layout.dock.includes(current.app)
      ) {
        return;
      }
      const target = [...container.querySelectorAll<HTMLElement>("[data-home-app]")].find(
        (slot) => {
          const box = slot.getBoundingClientRect();
          return (
            event.clientX >= box.left &&
            event.clientX <= box.right &&
            event.clientY >= box.top &&
            event.clientY <= box.bottom
          );
        },
      );
      const targetApp = target?.dataset.homeApp as AppId | undefined;
      if (targetApp === current.app) {
        return;
      }
      const next = {
        grid: current.layout.grid.filter((id) => id !== current.app),
        dock: current.layout.dock.filter((id) => id !== current.app),
      };
      const index =
        targetApp === undefined ? next[area].length : current.layout[area].indexOf(targetApp);
      next[area].splice(Math.min(index, next[area].length), 0, current.app);
      current.layout = next;
      setDraft(next);
      return;
    }
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    if (current.moving) {
      const area = current.layout.dock.includes(current.app) ? "dock" : "grid";
      try {
        homeScreen.move(current.app, area, current.layout[area].indexOf(current.app));
      } catch (cause) {
        setError((cause as Error).message);
      }
    }
    clearGesture();
  }
  function key(event: KeyboardEvent<HTMLButtonElement>, app: AppId, area: Area) {
    if (event.key === "F2") {
      event.preventDefault();
      onEditingChange(true);
      return;
    }
    if (!editing) {
      return;
    }
    if (event.key === "Delete" && appCatalog[app].removable) {
      event.preventDefault();
      setDeleting(app);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const targetArea =
      event.ctrlKey && (event.key === "ArrowDown" || event.key === "ArrowUp")
        ? event.key === "ArrowDown"
          ? "dock"
          : "grid"
        : area;
    const index = saved[area].indexOf(app);
    const nextIndex =
      targetArea !== area
        ? saved[targetArea].length
        : Math.max(
            0,
            Math.min(
              saved[area].length - 1,
              index + { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[event.key]!,
            ),
          );
    try {
      homeScreen.move(app, targetArea, nextIndex);
      requestAnimationFrame(() =>
        root.current!.querySelector<HTMLButtonElement>(`button[data-app="${app}"]`)!.focus(),
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function icons(area: Area) {
    return layout[area].map((app) => (
      <div
        key={app}
        data-home-app={app}
        className={`home-slot ${floating?.app === app ? "home-slot--dragging" : ""}`}
      >
        <Button
          className="home-app"
          data-app={app}
          aria-label={`${editing ? "移动" : "打开"}${appCatalog[app].name}`}
          aria-describedby={editing ? "home-edit-help" : undefined}
          onPointerDown={(event) => start(event, app)}
          onContextMenu={(event) => {
            event.preventDefault();
            onEditingChange(true);
          }}
          onKeyDown={(event) => key(event, app, area)}
          onClick={(event) => {
            if (!editing && (event.detail === 0 || !suppressClick.current)) {
              onOpen(event, app);
            }
          }}
        >
          <AppIcon app={app} />
          {area === "grid" ? <Text role="caption">{appCatalog[app].name}</Text> : null}
        </Button>
        {editing && appCatalog[app].removable ? (
          <Button
            className="home-remove"
            aria-label={`卸载${appCatalog[app].name}`}
            onClick={() => setDeleting(app)}
          >
            ×
          </Button>
        ) : null}
      </div>
    ));
  }
  return (
    <div
      ref={root}
      className={`home-screen ${editing ? "home-screen--editing" : ""}`}
      onPointerDownCapture={() => {
        suppressClick.current = false;
      }}
      onClick={(event) => {
        // 松手后的合成 click 仍属于拖动；下一次独立点按空白才结束编辑。
        if (
          editing &&
          deleting === null &&
          error === null &&
          !suppressClick.current &&
          !(event.target as Element).closest("[data-home-app], .ios-alert-overlay")
        ) {
          onEditingChange(false);
        }
      }}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={clearGesture}
      onLostPointerCapture={(event) => {
        if (event.target === event.currentTarget) {
          clearGesture();
        }
      }}
      onKeyDown={(event) => {
        if (editing && event.key === "Escape" && deleting === null && error === null) {
          event.preventDefault();
          event.stopPropagation();
          onEditingChange(false);
        }
      }}
    >
      <Page
        appearance="wallpaper"
        inert={deleting !== null || error !== null}
        footerHeight={112}
        footer={
          <div className="home-dock" data-home-area="dock" aria-label="Dock">
            {icons("dock")}
          </div>
        }
      >
        <div className="home-grid" data-home-area="grid" aria-label="主屏幕">
          {icons("grid")}
        </div>
        <div className="home-page-indicator" aria-label="第 1 页，共 1 页">
          <Icon appearance="page-dot" />
        </div>
        <span id="home-edit-help" className="home-edit-help">
          方向键移动图标，Ctrl 加上或下方向键移入主屏或 Dock，Delete 卸载，Escape 完成。
        </span>
      </Page>
      {floating ? (
        <div
          className="home-floating"
          aria-hidden="true"
          style={{ left: floating.x, top: floating.y }}
        >
          <AppIcon app={floating.app} />
        </div>
      ) : null}
      {deleting !== null ? (
        <Alert
          title={`卸载“${appCatalog[deleting].name}”？`}
          active={active}
          onDismiss={() => setDeleting(null)}
          actions={[
            { label: "取消", onClick: () => setDeleting(null) },
            {
              label: "卸载",
              primary: true,
              onClick: () => {
                try {
                  onUninstall(deleting);
                  setDeleting(null);
                  // 三个系统应用始终保留；卸载后将焦点交回可操作的图标。
                  requestAnimationFrame(() =>
                    root
                      .current!.querySelector<HTMLButtonElement>(".home-app")!
                      .focus({ preventScroll: true }),
                  );
                } catch (cause) {
                  setDeleting(null);
                  setError((cause as Error).message);
                }
              },
            },
          ]}
        >
          已保存的数据会保留，可随时从 App Store 重新安装。
        </Alert>
      ) : null}
      {error !== null ? (
        <Alert
          title="操作失败"
          active={active}
          onDismiss={() => setError(null)}
          actions={[{ label: "好", onClick: () => setError(null) }]}
        >
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
