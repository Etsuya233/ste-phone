interface MotionPoint {
  x: number;
  y: number;
  time: number;
}

const SAMPLE_WINDOW_MS = 80;

/** Logical pixels and PointerEvent timestamps measure the final movement, excluding earlier travel. */
export class HomeSwipeMotion {
  private points: MotionPoint[];

  constructor(start: MotionPoint) {
    this.points = [start];
  }

  record(point: MotionPoint): void {
    this.points.push(point);
    // Keep one sample before the window so sparse events still describe the final movement.
    while (this.points.length > 2 && this.points[1]!.time <= point.time - SAMPLE_WINDOW_MS) {
      this.points.shift();
    }
  }

  release(point: MotionPoint, measure: "speed" | "horizontal" = "speed"): number {
    const last = this.points.at(-1)!;
    if (point.x !== last.x || point.y !== last.y) {
      this.record(point);
    }
    const end = this.points.at(-1)!;
    // Normal pointer-up delivery gaps retain momentum; a genuinely stationary tail clears it.
    if (point.time - end.time >= SAMPLE_WINDOW_MS) {
      return 0;
    }
    const first = this.points[0]!;
    const dx = end.x - first.x;
    const distance = measure === "horizontal" ? dx : Math.hypot(dx, end.y - first.y);
    const elapsed = Math.min(SAMPLE_WINDOW_MS, end.time - first.time);
    // Same-frame movement is instantaneous; a same-position release has zero speed.
    return elapsed === 0
      ? distance === 0
        ? 0
        : Math.sign(distance) * Infinity
      : distance / elapsed;
  }
}
