import { segmentDistance, segmentsCross } from "./map-geometry.ts";
import type { MapDocument, MapFeature, MapPoint, MapReply } from "./map.ts";

type RouteRoad = MapFeature & { geometry: MapPoint[] };

function routableRoad(feature: MapFeature): feature is RouteRoad {
  return feature.kind === "road" && feature.geometry !== null;
}

function pointOnRoad(point: MapPoint, road: RouteRoad): boolean {
  // Only absorb floating-point error. A nearby road is not necessarily connected.
  return road.geometry.some(
    (end, i) => i > 0 && segmentDistance(point, road.geometry[i - 1]!, end) <= 1e-7,
  );
}

function roadsConnect(a: RouteRoad, b: RouteRoad): boolean {
  if (a.connects.some((id) => b.connects.includes(id))) {
    return true;
  }
  if (a.roadClass === "bridge" || b.roadClass === "bridge") {
    const bridge = a.roadClass === "bridge" ? a : b;
    const other = bridge === a ? b : a;
    // A bridge can meet other roads at its ends. Interior crossings pass above or below it.
    const ends = [bridge.geometry[0]!, bridge.geometry.at(-1)!];
    return other.roadClass === "bridge"
      ? ends.some((p) =>
          [other.geometry[0]!, other.geometry.at(-1)!].some(
            (q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1e-7,
          ),
        )
      : ends.some((point) => pointOnRoad(point, other));
  }
  return a.geometry.some(
    (end, i) =>
      i > 0 &&
      b.geometry.some(
        (otherEnd, j) =>
          j > 0 && segmentsCross(a.geometry[i - 1]!, end, b.geometry[j - 1]!, otherEnd),
      ),
  );
}

function roadServes(road: RouteRoad, target: MapFeature): boolean {
  return target.kind === "road"
    ? road.id === target.id
    : target.kind === "place" &&
        (road.connects.includes(target.id) ||
          (road.roadClass !== "bridge" &&
            !!target.geometry &&
            pointOnRoad(target.geometry[0]!, road)));
}

/** Find a chain with the fewest road changes, using the same links as final reply validation. */
export function findMapRoute(map: MapDocument, fromId: string, toId: string): string[] {
  const from = map.features.find((f) => f.id === fromId && f.kind !== "region");
  const to = map.features.find((f) => f.id === toId && f.kind !== "region");
  if (!from || !to || fromId === toId) {
    throw new Error("路线须指定两个不同的已有地点或道路");
  }
  const roads = map.features.filter(routableRoad);
  const queue = roads
    .filter((road) => roadServes(road, from))
    .map((road) => ({ road, ids: [road.id] }));
  const visited = new Set(queue.map(({ road }) => road.id));
  for (const { road, ids } of queue) {
    if (roadServes(road, to)) {
      return ids;
    }
    for (const next of roads) {
      if (!visited.has(next.id) && roadsConnect(road, next)) {
        visited.add(next.id);
        queue.push({ road: next, ids: [...ids, next.id] });
      }
    }
  }
  return [];
}

export function validateMapQuery(
  map: MapDocument,
  reply: Extract<MapReply, { type: "query" }>,
): void {
  const features = new Map(map.features.map((feature) => [feature.id, feature]));
  const targets = reply.featureIds.map((id) => {
    const feature = features.get(id);
    if (!feature) {
      throw new Error("地图查询引用了不存在的目标");
    }
    return feature;
  });
  const roads = reply.routeRoadIds.map((id) => {
    const road = features.get(id);
    if (!road || !routableRoad(road)) {
      throw new Error("路线引用了无法通行的道路");
    }
    return road;
  });
  if (!roads.length) {
    return;
  }
  const [from, to] = targets;
  if (targets.length !== 2 || !from || !to || from.id === to.id) {
    throw new Error("路线须指定两个不同的已有地点或道路");
  }
  if (roads.some((road, i) => i > 0 && !roadsConnect(roads[i - 1]!, road))) {
    throw new Error("路线中的已有道路不连通");
  }
  if (!roadServes(roads[0]!, from) || !roadServes(roads.at(-1)!, to)) {
    throw new Error("路线未连接指定的起点和终点");
  }
}
