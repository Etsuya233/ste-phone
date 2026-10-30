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
import { Stopwatch } from "../apps/stopwatch/stopwatch.tsx";
import { FoundationApp } from "../apps/foundation/foundation-app.tsx";
import { StatusBar } from "../system/status-bar.tsx";
import { DataSourceApp } from "../apps/data-source/data-source-app.tsx";
import type { PhoneDataSource } from "../../features/background/index.ts";
import type { PhoneDatabaseService } from "../../features/database/index.ts";
import { DatabaseApp } from "../apps/database/database-app.tsx";

import { appSession } from "./app-session.ts";
import type { AppId } from "./app-session.ts";
import { SettingsApp } from "../apps/settings/settings-app.tsx";
import type { PhoneSettingsService } from "../../features/settings/phone-settings.ts";
import { Expose } from "./expose.tsx";
import type { ExposeDrag } from "./expose.tsx";

type Transition = "entering" | "leaving" | "resuming" | "expose-home" | null;
const emptyDrag: ExposeDrag = { x: 0, y: 0, app: null };
const RunningApp = memo(function RunningApp({
  app,
  active,
  source,
  database,
  settings,
  onHome,
}: {
  app: AppId;
  active: boolean;
  source: PhoneDataSource;
  database: PhoneDatabaseService;
  settings: PhoneSettingsService;
  onHome: () => void;
}) {
  return app === "stopwatch" ? (
    <Stopwatch active={active} onExit={onHome} />
  ) : app === "foundation" ? (
    <FoundationApp active={active} onHome={onHome} />
  ) : app === "data-source" ? (
    <DataSourceApp active={active} source={source} onHome={onHome} />
  ) : app === "database" ? (
    <DatabaseApp active={active} database={database} onHome={onHome} />
  ) : (
    <SettingsApp active={active} settings={settings} onHome={onHome} />
  );
});
export function PhoneDevice({
  dataSource,
  database,
  settings,
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
  dataSource: PhoneDataSource;
  database: PhoneDatabaseService;
  settings: PhoneSettingsService;
}) {
  const screen = useRef<HTMLDivElement>(null);
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
  const [screenSize, setScreenSize] = useState({ width: 375, height: 667, bottom: 0 });
  const homeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedSettings = useSyncExternalStore(settings.subscribe, settings.getState);
  const lastApp = useRef<AppId | null>(initialApp === "home" ? null : initialApp);
  useEffect(() => {
    if (homeTimer.current !== null) {
      clearTimeout(homeTimer.current);
      homeTimer.current = null;
    }
    return () => {
      if (homeTimer.current !== null) clearTimeout(homeTimer.current);
    };
  }, [visible, page]);
  useLayoutEffect(() => {
    if (!visible) return;
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
    dispatch({ type: "quit", app: quittingApp! });
    setExposeIndex((index) =>
      Math.max(0, Math.min(index - (removedIndex < index ? 1 : 0), session.recent.length - 2)),
    );
    setQuittingApp(null);
    setExposeDrag(emptyDrag);
  };
  useEffect(() => {
    // Closing settles every visible operation; native dialog hiding must not strand a transition.
    if (visible) return;
    setExposeDrag(emptyDrag);
    if (quittingApp) completeQuit();
    if (transition === "leaving" || transition === "expose-home") dispatch({ type: "home" });
    if (transition) setTransition(null);
  }, [visible, transition, quittingApp]);
  useEffect(() => {
    if (!visible || transition || page === "expose") return;
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
      if (!preference.matches) return;
      if (quittingApp) completeQuit();
      if (transition === "leaving" || transition === "expose-home") dispatch({ type: "home" });
      setTransition(null);
    };
    preference.addEventListener("change", finish);
    return () => preference.removeEventListener("change", finish);
  }, [transition, quittingApp]);
  const open = (event: MouseEvent<HTMLButtonElement> | undefined, app: AppId) => {
    if (transition || quittingApp) return;
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
  };
  const home = useCallback(() => {
    if (page === "home") return;
    if (quittingApp) {
      dispatch({ type: "quit", app: quittingApp });
      setQuittingApp(null);
      setExposeIndex((index) => Math.max(0, Math.min(index, session.recent.length - 2)));
    }
    setExposeDrag(emptyDrag);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dispatch({ type: "home" });
      setTransition(null);
    } else setTransition(page === "expose" ? "expose-home" : "leaving");
  }, [page, quittingApp, session.recent.length]);
  const expose = () => {
    if (quittingApp) completeQuit();
    setExposeIndex(0);
    setExposeDrag(emptyDrag);
    dispatch({ type: "expose" });
    setTransition(null);
  };
  const quit = (app: AppId) => {
    if (transition || quittingApp) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const removed = session.recent.indexOf(app);
      dispatch({ type: "quit", app });
      setExposeIndex((index) =>
        Math.max(0, Math.min(index - (removed < index ? 1 : 0), session.recent.length - 2)),
      );
    } else setQuittingApp(app);
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
  const homePress = () => {
    if (homeTimer.current !== null) {
      clearTimeout(homeTimer.current);
      homeTimer.current = null;
      expose();
    } else
      homeTimer.current = setTimeout(() => {
        homeTimer.current = null;
        home();
      }, 280);
  };
  return (
    <div className="phone-device">
      <span className="device-mute" aria-hidden="true" />
      <span className="device-volume device-volume--up" aria-hidden="true" />
      <span className="device-volume device-volume--down" aria-hidden="true" />
      <span className="device-power" aria-hidden="true" />
      <div
        className={`device-top ${draggable ? "device-top--draggable" : ""}`}
        aria-hidden="true"
        {...dragEvents}
      >
        <span className="device-camera" />
        <span className="device-speaker" />
      </div>
      <div ref={screen} className="phone-screen">
        <div
          className={`system-workspace ${page === "expose" ? "system-workspace--expose" : ""} ${exposeDrag.x || exposeDrag.y ? "system-workspace--dragging" : ""} ${transition === "expose-home" ? "system-workspace--expose-home" : ""}`}
        >
          <div
            className={`phone-wallpaper ${selectedSettings.blur ? "phone-wallpaper--blur" : ""}`}
            style={
              selectedSettings.wallpaper.kind === "image"
                ? {
                    backgroundImage: `url(${JSON.stringify(settings.imageUrl(selectedSettings.wallpaper))})`,
                  }
                : undefined
            }
          />
          <div className="expose-shade" />
          <div
            className={`home-layer ${page !== "home" && transition !== "expose-home" ? "home-layer--covered" : ""}`}
            inert={page !== "home" || !visible}
          >
            <Home onOpen={open} />
          </div>
          {session.recent.map((app, index) => {
            const foreground = page === app;
            const inExpose = page === "expose";
            const active = visible && foreground && !transition;
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
                  if (event.target !== event.currentTarget || event.propertyName !== "transform")
                    return;
                  if (quittingApp === app) completeQuit();
                  else if (foreground && transition === "resuming") setTransition(null);
                }}
                onAnimationEnd={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (transition === "leaving") dispatch({ type: "home" });
                  setTransition(null);
                }}
              >
                <div className="app-content" inert={!active} aria-hidden={!active}>
                  <div className="app-preview-status">
                    <StatusBar light={false} active={false} />
                  </div>
                  <RunningApp
                    app={app}
                    active={active}
                    source={dataSource}
                    database={database}
                    settings={settings}
                    onHome={home}
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
              visible={visible}
              blocked={transition !== null || quittingApp !== null}
              quitting={quittingApp}
              leaving={transition === "expose-home"}
              onDrag={setExposeDrag}
              onSelect={setExposeIndex}
              onOpen={(app) => open(undefined, app)}
              onQuit={quit}
              onLeaveEnd={() => {
                dispatch({ type: "home" });
                setTransition(null);
              }}
            />
          ) : null}
        </div>
        {page !== "expose" ? <StatusBar light={page === "home"} active={visible} /> : null}
        <div className="software-home">
          <button aria-label="Home，单击返回主屏幕，双击查看后台" onClick={homePress}>
            <span />
          </button>
        </div>
      </div>
      <div className="device-bottom">
        <button
          className="device-home"
          aria-label="Home，单击返回主屏幕，双击查看后台"
          onClick={homePress}
        />
      </div>
    </div>
  );
}
