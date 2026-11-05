import { useEffect, useRef, useState } from "react";
import type { RefObject, PointerEvent, HTMLAttributes } from "react";

export function useUnlockSwipe(
  surface: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  onUnlock: () => void,
) {
  const gesture = useRef<{ id: number; x: number; y: number; scale: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const cancel = () => {
    gesture.current = null;
    setOffset(0);
    setDragging(false);
  };
  useEffect(() => {
    cancel();
    return () => {
      gesture.current = null;
    };
  }, [enabled]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        cancel();
      }
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) {
      return;
    }
    gesture.current = null;
    setDragging(false);
    const distance = (start.y - event.clientY) / start.scale;
    const horizontal = Math.abs(event.clientX - start.x) / start.scale;
    // The threshold uses logical screen pixels, independent of the device's CSS scaling.
    if (!cancelled && distance >= 70 && distance > horizontal) {
      onUnlock();
    } else {
      setOffset(0);
    }
  };
  const events: HTMLAttributes<HTMLDivElement> = {
    onPointerDown: (event) => {
      if (!enabled || !event.isPrimary || event.button !== 0) {
        return;
      }
      gesture.current = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        scale: event.currentTarget.getBoundingClientRect().width / event.currentTarget.clientWidth,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    },
    onPointerMove: (event) => {
      const start = gesture.current;
      if (start?.id === event.pointerId) {
        setOffset(
          Math.max(
            0,
            Math.min(surface.current!.clientHeight, (start.y - event.clientY) / start.scale),
          ),
        );
      }
    },
    onPointerUp: (event) => finish(event),
    onPointerCancel: (event) => finish(event, true),
    onLostPointerCapture: (event) => finish(event, true),
    onBlur: cancel,
  };
  return { offset, dragging, events };
}
