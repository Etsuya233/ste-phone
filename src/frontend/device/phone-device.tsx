import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useReducer,
  useSyncExternalStore,
  useCallback,
  memo,
} from "react";
import type { CSSProperties, MouseEvent, HTMLAttributes } from "react";
import { Home } from "../apps/home/home.tsx";
import { StatusBar } from "../system/status-bar.tsx";
import { appSession } from "./app-session.ts";
import type { AppId } from "./app-session.ts";
import type { AppDefinition } from "./app-lifecycle.ts";
import type {
  WallpaperReader,
  HomeScreenSettings,
  DeviceModel,
} from "../../apps/settings/public.ts";
import { deviceModels } from "./device-models.ts";
import { LockScreen, SleepingScreen } from "./lock-screen.tsx";
import { useScreenLock } from "./use-screen-lock.ts";
import { useHomeControl } from "./use-home-control.ts";
import { Expose } from "./expose.tsx";
import type { ExposeDrag } from "./expose.tsx";

type Transition = "entering" | "leaving" | "resuming" | "expose-home" | null;
const emptyDrag: ExposeDrag = { x: 0, y: 0, app: null };
const RunningApp = memo(function RunningApp({
  definition,
  active,
  foreground,
  windowVisible,
  onHome,
  onOpen,
}: {
  definition: AppDefinition;
  active: boolean;
  foreground: boolean;
  windowVisible: boolean;
  onHome: () => void;
  onOpen: (app: AppId) => void;
}) {
  useEffect(() => {
    definition.onVisibilityChange?.({ foreground, windowVisible });
  }, [definition, foreground, windowVisible]);
  return definition.render({ active, onHome, onOpen, visibility: { foreground, windowVisible } });
});
export function PhoneDevice({
  wallpaper,
  homeScreen,
  deviceModel,
  apps,
  visible,
  scale,
  draggable,
  initialApp = "home",
  ...dragEvents
}: Pick<
  HTMLAttributes<HTMLDivElement>,
  "onPointerDown" | "onPointerMove" | "onPointerUp" | "onLostPointerCapture"
> & {
  scale: number;
  draggable: boolean;
  visible: boolean;
  initialApp?: AppId | "home";
  wallpaper: WallpaperReader;
  homeScreen: HomeScreenSettings;
  deviceModel: DeviceModel;
  apps: Record<AppId, AppDefinition>;
}) {
  const screen = useRef<HTMLDivElement>(null);
  const lock = useScreenLock(screen, visible);
  const interactive = visible && lock.state === "unlocked";
  const [editingHome, setEditingHome] = useState(false);
  const [session, dispatch] = useReducer(appSession, {
    foreground: initialApp,
    recent: initialApp === "home" ? [] : [initialApp],
  });
  const page = session.foreground;
  const [transition, setTransition] = useState<Transition>(null);
  const [origin, setOrigin] = useState("50% 90%");
  const [exposeIndex, setExposeIndex] = useState(0);
  const [exposeDrag, setExposeDrag] = useState<ExposeDrag>(emptyDrag);
  const [quittingApp, setQuittingApp] = useState<AppId | null>(null);
  const [screenSize, setScreenSize] = useState(() => ({
    width: deviceModels[deviceModel].screenWidth,
    height: deviceModels[deviceModel].screenHeight,
    bottom: 0,
  }));
  const selectedSettings = useSyncExternalStore(wallpaper.subscribe, wallpaper.getSnapshot);
  const lastApp = useRef<AppId | null>(initialApp === "home" ? null : initialApp);
  useLayoutEffect(() => {
    if (!visible) {
      return;
    }
    const measure = () => {
      const element = screen.current!;
      const size = {
        width: element.clientWidth,
        height: element.clientHeight,
        bottom: element.querySelector<HTMLElement>(".software-home")!.clientHeight,
      };
      setScreenSize((previous) =>
        previous.width === size.width &&
        previous.height === size.height &&
        previous.bottom === size.bottom
          ? previous
          : size,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(screen.current!);
    return () => observer.disconnect();
  }, [visible]);
  const completeQuit = () => {
    const removedIndex = session.recent.indexOf(quittingApp!);
    apps[quittingApp!].onQuit?.();
    dispatch({ type: "quit", app: quittingApp! });
    setExposeIndex((index) =>
      Math.max(0, Math.min(index - (removedIndex < index ? 1 : 0), session.recent.length - 2)),
    );
    setQuittingApp(null);
    setExposeDrag(emptyDrag);
  };
  useEffect(() => {
    // Hiding or locking settles visible operations so the preserved session cannot strand a transition.
    if (interactive) {
      return;
    }
    setExposeDrag(emptyDrag);
    if (quittingApp) {
      completeQuit();
    }
    if (transition === "leaving" || transition === "expose-home") {
      dispatch({ type: "home" });
    }
    if (transition) {
      setTransition(null);
    }
  }, [interactive, transition, quittingApp]);
  useEffect(() => {
    if (!interactive || transition || page === "expose") {
      return;
    }
    const target =
      page === "home"
        ? screen.current!.querySelector<HTMLButtonElement>(
            `button[data-app="${lastApp.current ?? "database"}"]`,
          )
        : screen.current!.querySelector<HTMLButtonElement>(
            `.app-layer[data-app="${page}"] .navigation-entry--current .ios-nav button, .app-layer[data-app="${page}"] .app-content > .ios-page .ios-nav button`,
          );
    target?.focus({ preventScroll: true });
  }, [visible, page, transition]);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const finish = () => {
      if (!preference.matches) {
        return;
      }
      if (quittingApp) {
        completeQuit();
      }
      if (transition === "leaving" || transition === "expose-home") {
        dispatch({ type: "home" });
      }
      setTransition(null);
    };
    preference.addEventListener("change", finish);
    return () => preference.removeEventListener("change", finish);
  }, [transition, quittingApp]);
  const open = useCallback(
    (event: MouseEvent<HTMLButtonElement> | undefined, app: AppId) => {
      if (transition || quittingApp) {
        return;
      }
      const layout = homeScreen.getSnapshot();
      if (![...layout.grid, ...layout.dock].includes(app)) {
        throw new Error("应用未安装");
      }
      setEditingHome(false);
      if (event) {
        const icon = event.currentTarget.getBoundingClientRect();
        const bounds = screen.current!.getBoundingClientRect();
        setOrigin(
          `${(icon.left + icon.width / 2 - bounds.left) / scale}px ${(icon.top + icon.height / 2 - bounds.top) / scale}px`,
        );
      }
      lastApp.current = app;
      dispatch({ type: "open", app });
      setExposeDrag(emptyDrag);
      setTransition(
        matchMedia("(prefers-reduced-motion: reduce)").matches
          ? null
          : page === "expose"
            ? "resuming"
            : "entering",
      );
    },
    [transition, quittingApp, homeScreen, scale, page],
  );
  const openApp = useCallback((app: AppId) => open(undefined, app), [open]);
  const home = useCallback(() => {
    if (page === "home") {
      return;
    }
    if (quittingApp) {
      apps[quittingApp].onQuit?.();
      dispatch({ type: "quit", app: quittingApp });
      setQuittingApp(null);
      setExposeIndex((index) => Math.max(0, Math.min(index, session.recent.length - 2)));
    }
    setExposeDrag(emptyDrag);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dispatch({ type: "home" });
      setTransition(null);
    } else {
      if (page !== "expose") {
        const desktop = screen.current!.querySelector<HTMLElement>(".home-layer")!;
        const bounds = desktop.getBoundingClientRect();
        const icon = desktop
          .querySelector<HTMLButtonElement>(`button[data-app="${page}"]`)!
          .getBoundingClientRect();
        // Desktop-relative ratios remove both device scaling and the covered desktop's zoom.
        setOrigin(
          `${((icon.left + icon.width / 2 - bounds.left) / bounds.width) * desktop.clientWidth}px ${((icon.top + icon.height / 2 - bounds.top) / bounds.height) * desktop.clientHeight}px`,
        );
      }
      setTransition(page === "expose" ? "expose-home" : "leaving");
    }
  }, [page, quittingApp, session.recent.length, apps]);
  const expose = () => {
    if (quittingApp) {
      completeQuit();
    }
    setExposeIndex(0);
    setExposeDrag(emptyDrag);
    dispatch({ type: "expose" });
    setTransition(null);
  };
  const quit = (app: AppId) => {
    if (transition || quittingApp) {
      return;
    }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const removed = session.recent.indexOf(app);
      apps[app].onQuit?.();
      dispatch({ type: "quit", app });
      setExposeIndex((index) =>
        Math.max(0, Math.min(index - (removed < index ? 1 : 0), session.recent.length - 2)),
      );
    } else {
      setQuittingApp(app);
    }
    setExposeDrag(emptyDrag);
  };
  // Leave space above and below the preview-and-icon group, including on short screens.
  const previewScale = Math.min(
    0.64,
    (screenSize.height - screenSize.bottom - 240) / screenSize.height,
  );
  const previewWidth = screenSize.width * previewScale;
  const previewHeight = screenSize.height * previewScale;
  const previewLeft = (screenSize.width - previewWidth) / 2;
  const previewTop = Math.max(
    72,
    (screenSize.height - screenSize.bottom - previewHeight - 118) / 2,
  );
  const stride = previewWidth + 28;
  const homeControl = useHomeControl({
    deviceModel,
    visible,
    sessionKey: page,
    lockState: lock.state,
    editingHome,
    onFinishEditing: () => setEditingHome(false),
    wake: lock.wake,
    unlock: lock.unlock,
    onHome: () => {
      if (editingHome) {
        setEditingHome(false);
      } else {
        home();
      }
    },
    onExpose: () => {
      setEditingHome(false);
      expose();
    },
  });
  const homeLabel =
    lock.state === "unlocked"
      ? deviceModel === "iphone-17"
        ? "Home，上滑返回主屏幕，上滑停留查看后台；也可单击返回、双击查看后台"
        : "Home，单击返回主屏幕，双击查看后台"
      : deviceModel === "iphone-6s"
        ? "Home，短按唤醒，长按解锁"
        : "Home，向上滑动解锁";
  return (
    <div className="phone-device">
      <span className="device-mute" aria-hidden="true" />
      <span className="device-volume device-volume--up" aria-hidden="true" />
      <span className="device-volume device-volume--down" aria-hidden="true" />
      <button
        type="button"
        className="device-power"
        aria-label={lock.state === "asleep" ? "唤醒屏幕" : "锁屏"}
        onPointerDown={(event) => event.preventDefault()}
        onClick={lock.power}
      />
      <div
        className={`device-top ${draggable ? "device-top--draggable" : ""}`}
        aria-hidden="true"
        {...dragEvents}
      >
        <span className="device-camera" />
        <span className="device-speaker" />
      </div>
      <div ref={screen} className={`phone-screen phone-screen--${lock.state}`}>
        <div
          className={`device-island ${draggable ? "device-island--draggable" : ""}`}
          aria-hidden="true"
          {...dragEvents}
        />
        <div
          inert={!interactive}
          aria-hidden={!interactive}
          className={`system-workspace ${page === "expose" ? "system-workspace--expose" : ""} ${exposeDrag.x || exposeDrag.y ? "system-workspace--dragging" : ""} ${transition === "expose-home" ? "system-workspace--expose-home" : ""}`}
        >
          <div
            className={`phone-wallpaper ${selectedSettings.blur ? "phone-wallpaper--blur" : ""}`}
            style={
              selectedSettings.wallpaper.kind === "image"
                ? {
                    backgroundImage: `url(${JSON.stringify(selectedSettings.url)})`,
                  }
                : undefined
            }
          />
          <div className="expose-shade" />
          <div
            className={`home-layer ${(page !== "home" && transition !== "expose-home") || lock.state === "asleep" || lock.state === "locked" ? "home-layer--covered" : ""}`}
            inert={page !== "home" || !interactive}
          >
            <Home
              onOpen={open}
              homeScreen={homeScreen}
              active={interactive && page === "home"}
              editing={editingHome}
              onEditingChange={setEditingHome}
              onUninstall={(app) => {
                homeScreen.uninstall(app);
                if (session.recent.includes(app)) {
                  apps[app].onQuit?.();
                  dispatch({ type: "quit", app });
                }
              }}
            />
          </div>
          {session.recent.map((app, index) => {
            const foreground = page === app;
            const inExpose = page === "expose";
            const active = interactive && foreground && !transition;
            const x = previewLeft + (index - exposeIndex) * stride + exposeDrag.x;
            const y =
              quittingApp === app
                ? -screenSize.height
                : previewTop + (exposeDrag.app === app ? exposeDrag.y : 0);
            return (
              <div
                key={app}
                data-app={app}
                className={`app-layer ${inExpose ? "app-layer--preview" : ""} ${quittingApp === app ? "app-layer--quitting" : ""} ${foreground && transition ? `app-layer--${transition}` : ""}`}
                hidden={!foreground && !inExpose}
                style={
                  {
                    "--app-origin": origin,
                    transform: inExpose
                      ? `translate(${x}px, ${y}px) scale(${previewScale})`
                      : undefined,
                  } as CSSProperties
                }
                onTransitionEnd={(event) => {
                  if (event.target !== event.currentTarget || event.propertyName !== "transform") {
                    return;
                  }
                  if (quittingApp === app) {
                    completeQuit();
                  } else if (foreground && transition === "resuming") {
                    setTransition(null);
                  }
                }}
                onAnimationEnd={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }
                  if (transition === "leaving") {
                    dispatch({ type: "home" });
                  }
                  setTransition(null);
                }}
              >
                <div className="app-content" inert={!active} aria-hidden={!active}>
                  <div className="app-preview-status">
                    <StatusBar light={false} active={false} />
                  </div>
                  <RunningApp
                    definition={apps[app]}
                    active={active}
                    foreground={foreground && lock.state === "unlocked"}
                    windowVisible={interactive}
                    onHome={home}
                    onOpen={openApp}
                  />
                </div>
              </div>
            );
          })}
          {page === "expose" ? (
            <Expose
              apps={session.recent}
              selectedIndex={exposeIndex}
              layout={{
                width: previewWidth,
                height: previewHeight,
                left: previewLeft,
                top: previewTop,
                stride,
              }}
              drag={exposeDrag}
              deviceScale={scale}
              visible={interactive}
              blocked={transition !== null || quittingApp !== null}
              quitting={quittingApp}
              leaving={transition === "expose-home"}
              onDrag={setExposeDrag}
              onSelect={setExposeIndex}
              onOpen={openApp}
              onQuit={quit}
              onLeaveEnd={() => {
                dispatch({ type: "home" });
                setTransition(null);
              }}
            />
          ) : null}
        </div>
        {lock.state === "unlocked" && page !== "expose" ? (
          <StatusBar light={page === "home"} active={visible} />
        ) : null}
        {visible && lock.state === "asleep" ? <SleepingScreen onWake={lock.wake} /> : null}
        {visible && (lock.state === "locked" || lock.state === "unlocking") ? (
          <LockScreen
            deviceModel={deviceModel}
            wallpaper={selectedSettings}
            onUnlock={lock.unlock}
            unlocking={lock.state === "unlocking"}
            onUnlockEnd={lock.finishUnlock}
          />
        ) : null}
        <div
          className="software-home"
          inert={deviceModel === "iphone-17" && lock.state === "asleep"}
        >
          {deviceModel === "iphone-6s" ? (
            <button
              type="button"
              className="software-lock"
              aria-label="锁屏"
              onPointerDown={(event) => event.preventDefault()}
              onClick={lock.power}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="10" width="14" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            className="software-home-button"
            aria-label={homeLabel}
            {...homeControl}
          >
            <span />
          </button>
        </div>
      </div>
      <div className="device-bottom">
        <button type="button" className="device-home" aria-label={homeLabel} {...homeControl} />
      </div>
    </div>
  );
}
