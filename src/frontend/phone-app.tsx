import type { WallpaperReader, HomeScreenSettings } from "../apps/settings/public.ts";
import type { AppDefinition } from "./device/app-lifecycle.ts";
import type { AppId } from "./device/app-session.ts";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { PhoneDevice } from "./device/phone-device.tsx";
import { StEntry } from "./host/st-entry.tsx";
import type { StMenuEntry } from "./host/st-entry.tsx";

const DEVICE_WIDTH = 430;
const DEVICE_HEIGHT = 886;
const VIEWPORT_GAP = 12;

export function PhoneApp({
  wallpaper,
  homeScreen,
  apps,
  responsive = false,
  draggable = false,
  initialApp = "home",
  menuEntry,
}: {
  responsive?: boolean;
  draggable?: boolean;
  initialApp?: "home" | AppId;
  wallpaper: WallpaperReader;
  homeScreen: HomeScreenSettings;
  apps: Record<AppId, AppDefinition>;
  menuEntry?: StMenuEntry;
}) {
  const panel = useRef<HTMLDialogElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
    left: window.visualViewport?.offsetLeft ?? 0,
    top: window.visualViewport?.offsetTop ?? 0,
  }));
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const fullscreen = responsive && viewport.width <= 480;
  const scale = fullscreen
    ? 1
    : Math.min(
        1,
        (viewport.width - VIEWPORT_GAP * 2) / DEVICE_WIDTH,
        (viewport.height - VIEWPORT_GAP * 2) / DEVICE_HEIGHT,
      );
  const width = fullscreen ? viewport.width : DEVICE_WIDTH * scale;
  const height = fullscreen ? viewport.height : DEVICE_HEIGHT * scale;
  const horizontalTravel = Math.max(0, (viewport.width - width) / 2 - VIEWPORT_GAP);
  const verticalTravel = Math.max(0, (viewport.height - height) / 2 - VIEWPORT_GAP);
  const x = fullscreen ? 0 : Math.max(-horizontalTravel, Math.min(horizontalTravel, position.x));
  const y = fullscreen ? 0 : Math.max(-verticalTravel, Math.min(verticalTravel, position.y));
  useEffect(() => {
    const resize = () =>
      setViewport({
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
        left: window.visualViewport?.offsetLeft ?? 0,
        top: window.visualViewport?.offsetTop ?? 0,
      });
    window.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("resize", resize);
    window.visualViewport?.addEventListener("scroll", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("resize", resize);
      window.visualViewport?.removeEventListener("scroll", resize);
    };
  }, []);
  const startDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggable || fullscreen || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: x,
      top: y,
    };
  };
  const moveDrag = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setPosition({
      x: Math.max(
        -horizontalTravel,
        Math.min(horizontalTravel, current.left + event.clientX - current.x),
      ),
      y: Math.max(
        -verticalTravel,
        Math.min(verticalTravel, current.top + event.clientY - current.y),
      ),
    });
  };
  const openPhone = () => {
    setPosition({ x: 0, y: 0 });
    setStarted(true);
    setOpen(true);
    panel.current!.showModal();
  };
  return (
    <>
      {menuEntry ? (
        <StEntry {...menuEntry} open={open} onOpen={openPhone} />
      ) : (
        <button
          ref={launcher}
          type="button"
          className="phone-launcher"
          aria-label="打开小手机"
          aria-controls="ste-phone-panel"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={openPhone}
        >
          手机
        </button>
      )}
      <dialog
        ref={panel}
        id="ste-phone-panel"
        className={`phone-panel ${fullscreen ? "phone-panel--responsive" : ""}`}
        aria-label="小手机"
        style={
          {
            width,
            height,
            left: viewport.left + (viewport.width - width) / 2 + x,
            top: viewport.top + (viewport.height - height) / 2 + y,
            "--device-scale": scale,
          } as CSSProperties
        }
        onClose={() => {
          drag.current = null;
          setOpen(false);
          setPosition({ x: 0, y: 0 });
          if (menuEntry) menuEntry.button.focus();
          else launcher.current!.focus();
        }}
      >
        {started ? (
          <div className="device-stage">
            <button
              type="button"
              className="phone-close"
              aria-label="关闭小手机"
              onClick={() => panel.current!.close()}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="m5 5 10 10M15 5 5 15" />
              </svg>
            </button>
            <PhoneDevice
              visible={open}
              wallpaper={wallpaper}
              homeScreen={homeScreen}
              apps={apps}
              initialApp={initialApp}
              scale={scale}
              draggable={draggable && !fullscreen}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={() => {
                drag.current = null;
              }}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
            />
          </div>
        ) : null}
      </dialog>
    </>
  );
}
