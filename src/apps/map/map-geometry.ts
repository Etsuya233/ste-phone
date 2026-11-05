import type { MapPoint } from "./map.ts";

export type MapBounds = [number, number, number, number];
export function geometryBounds(points: MapPoint[]): MapBounds {
  return [
    Math.min(...points.map((p) => p[0])),
    Math.min(...points.map((p) => p[1])),
    Math.max(...points.map((p) => p[0])),
    Math.max(...points.map((p) => p[1])),
  ];
}
export function boundsOverlap(a: MapBounds, b: MapBounds, padding = 0): boolean {
  return (
    a[0] - padding <= b[2] &&
    a[2] + padding >= b[0] &&
    a[1] - padding <= b[3] &&
    a[3] + padding >= b[1]
  );
}
export function pointInPolygon(point: MapPoint, polygon: MapPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}
export function segmentDistance(point: MapPoint, a: MapPoint, b: MapPoint): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}
export function polygonDistance(point: MapPoint, polygon: MapPoint[]): number {
  if (pointInPolygon(point, polygon)) {
    return 0;
  }
  return Math.min(
    ...polygon.map((a, i) => segmentDistance(point, a, polygon[(i + 1) % polygon.length]!)),
  );
}
export function segmentsCross(a: MapPoint, b: MapPoint, c: MapPoint, d: MapPoint): boolean {
  const cross = (p: MapPoint, q: MapPoint, r: MapPoint) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return (
    cross(a, b, c) * cross(a, b, d) <= 0 &&
    cross(c, d, a) * cross(c, d, b) <= 0 &&
    boundsOverlap(geometryBounds([a, b]), geometryBounds([c, d]))
  );
}
export function polygonEdgesCross(a: MapPoint[], b: MapPoint[]): boolean {
  return a.some((point, i) =>
    b.some((other, j) =>
      segmentsCross(point, a[(i + 1) % a.length]!, other, b[(j + 1) % b.length]!),
    ),
  );
}
export function polygonsOverlap(a: MapPoint[], b: MapPoint[]): boolean {
  return (
    a.some((point) => pointInPolygon(point, b)) ||
    b.some((point) => pointInPolygon(point, a)) ||
    polygonEdgesCross(a, b)
  );
}
