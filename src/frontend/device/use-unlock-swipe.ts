import { useRef, useState } from "react";
import type { RefObject, PointerEvent, HTMLAttributes } from "react";

export function useUnlockSwipe(surface: RefObject<HTMLDivElement | null>, onUnlock: () => void) {
  const gesture = useRef<{ id: number; x: number; y: number; scale: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const finish = (event: PointerEvent<HTMLDivElement>, cancelled = false) => {
    const start = gesture.current;
    if (!start || start.id !== event.pointerId) {
      return;
    }
    gesture.current = null;
    setDragging(false);
    const distance = (event.clientX - start.x) / start.scale;
    const vertical = Math.abs(event.clientY - start.y) / start.scale;
    // The threshold uses logical screen pixels, independent of the device's CSS scaling.
    if (!cancelled && distance >= surface.current!.clientWidth * 0.3 && distance > vertical) {
      // A full-width drag has already reached the final transform, so no transition will fire.
      if (
        distance >= surface.current!.clientWidth ||
        matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        onUnlock();
      } else {
        setLeaving(true);
        setOffset(surface.current!.clientWidth);
      }
    } else {
      setOffset(0);
    }
  };
  const events: HTMLAttributes<HTMLDivElement> = {
    onPointerDown: (event) => {
      if (!event.isPrimary || event.button !== 0 || leaving) {
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
            Math.min(surface.current!.clientWidth, (event.clientX - start.x) / start.scale),
          ),
        );
      }
    },
    onPointerUp: (event) => finish(event),
    onPointerCancel: (event) => finish(event, true),
    onLostPointerCapture: (event) => finish(event, true),
    onTransitionEnd: (event) => {
      if (leaving && event.target === event.currentTarget && event.propertyName === "transform") {
        onUnlock();
      }
    },
    onTransitionCancel: (event) => {
      // Changing reduced-motion while leaving cancels CSS interpolation; finish the unlock.
      if (leaving && event.target === event.currentTarget && event.propertyName === "transform") {
        onUnlock();
      }
    },
  };
  return { offset, dragging, events };
}
