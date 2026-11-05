import type { MapDocument, MapReply } from "./map.ts";

/** 路线须是一条按顺序连通的已有道路链；未知目标与断路直接暴露。 */
export function validateMapQuery(
  map: MapDocument,
  reply: Extract<MapReply, { type: "query" }>,
): void {
  if (reply.featureIds.some((id) => !map.features.some((f) => f.id === id))) {
    throw new Error("地图查询引用了不存在的目标");
  }
  const roads = reply.routeRoadIds.map((id) => {
    const road = map.features.find((f) => f.id === id && f.kind === "road");
    if (!road || road.connects.length !== 2 || !road.geometry) {
      throw new Error("路线引用了无法通行的道路");
    }
    return road;
  });
  if (!roads.length) {
    return;
  }
  const endpoints = reply.featureIds.filter((id) =>
    map.features.some((f) => f.id === id && f.kind === "place"),
  );
  if (endpoints.length !== 2) {
    throw new Error("路线查询须明确两个已有地点端点");
  }
  let current = endpoints[0]!;
  for (const road of roads) {
    if (!road.connects.includes(current)) {
      throw new Error("路线中的已有道路不连通");
    }
    current = road.connects.find((id) => id !== current)!;
  }
  if (current !== endpoints[1]) {
    throw new Error("路线未到达指定地点");
  }
}
