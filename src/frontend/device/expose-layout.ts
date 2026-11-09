import type { SystemStyle } from "../../apps/settings/public.ts";
import type { AppId } from "./app-session.ts";

export interface ExposeDrag {
  x: number;
  y: number;
  app: AppId | null;
}
export interface ExposeLayout {
  style: SystemStyle;
  scale: number;
  width: number;
  height: number;
  left: number;
  top: number;
  stride: number;
  direction: 1 | -1;
  screenWidth: number;
}

export function exposeSwipeSteps(layout: ExposeLayout, distance: number, velocity: number): number {
  if (Math.abs(distance) < 48) {
    return 0;
  }
  const direction = Math.sign(distance);
  if (layout.style === "classic") {
    return -direction;
  }
  // Project briefly in the drag direction, adding at most one card of travel.
  const momentum = Math.min(layout.stride, Math.max(0, velocity * direction * 160));
  const cards = Math.max(1, Math.round((Math.abs(distance) + momentum) / layout.stride));
  return -direction * layout.direction * cards;
}

export function createExposeLayout(
  screen: { width: number; height: number; bottom: number; status: number },
  style: SystemStyle,
): ExposeLayout {
  const modern = style === "ios26";
  const scale = modern
    ? Math.min(0.78, (screen.height - screen.bottom - screen.status - 100) / screen.height)
    : Math.min(0.64, (screen.height - screen.bottom - 240) / screen.height);
  const width = screen.width * scale;
  const height = screen.height * scale;
  return {
    style,
    scale,
    width,
    height,
    left: (screen.width - width) / 2,
    top: modern
      ? Math.max(screen.status + 52, (screen.height - screen.bottom - height) / 2 + 20)
      : Math.max(72, (screen.height - screen.bottom - height - 118) / 2),
    stride: modern ? screen.width * 0.62 : width + 28,
    direction: modern ? -1 : 1,
    screenWidth: screen.width,
  };
}

/** Pages and pointer targets share this geometry, including fractional movement between cards. */
export function placeExposeCard(
  layout: ExposeLayout,
  index: number,
  selectedIndex: number,
  dragX: number,
) {
  if (layout.style === "classic") {
    return {
      left: layout.left + (index - selectedIndex) * layout.stride + dragX,
      top: layout.top,
      width: layout.width,
      height: layout.height,
      scale: layout.scale,
      zIndex: undefined,
    };
  }
  const position = (index - selectedIndex) * layout.direction + dragX / layout.stride;
  const depth = Math.min(3, Math.max(0, -position));
  const factor = 1 - depth * 0.025;
  // Older cards gather on the left; newer cards pass in front from the right.
  const offset =
    position >= 0
      ? position * layout.stride
      : Math.max(-1, position) * layout.screenWidth * 0.18 +
        Math.min(0, position + 1) * layout.screenWidth * 0.065;
  return {
    left: layout.left + offset,
    // Keep the deck's vertical center fixed so rear cards inset at both edges.
    top: layout.top + (layout.height * (1 - factor)) / 2,
    width: layout.width * factor,
    height: layout.height * factor,
    scale: layout.scale * factor,
    // Each deck has its own stacking context; recent cards cover older cards.
    zIndex: -index,
  };
}
