import type { MapFeature, MapPoint } from "./map.ts";
import {
  boundsOverlap,
  geometryBounds,
  pointInPolygon,
  polygonDistance,
  polygonEdgesCross,
  polygonsOverlap,
  segmentDistance,
} from "./map-geometry.ts";

export interface MapDecoration {
  buildings: { ownerId: string; geometry: MapPoint[]; tone: number }[];
  trees: { ownerId: string; point: MapPoint; radius: number }[];
}
const cache = new WeakMap<MapFeature, { signature: string; decoration: MapDecoration }>();
export const roadClearance = { arterial: 9, street: 5, path: 2.5, bridge: 9 };

function reservedArea(feature: MapFeature, owner: MapFeature): boolean {
  return (
    feature.kind === "region" &&
    (feature.terrain === "water" ||
      feature.terrain === "park" ||
      feature.cartography?.layer === "building" ||
      feature.parentId === owner.id ||
      feature.cartography?.landuse === "forest")
  );
}

function seededRandom(identity: string): () => number {
  let state = 2166136261;
  for (const character of identity) {
    state = Math.imul(state ^ character.charCodeAt(0), 16777619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every candidate uses region-local randomness. Obstacles reject candidates without shifting later cells. */
function clearFootprint(
  polygon: MapPoint[],
  owner: MapFeature,
  obstacles: MapFeature[],
  size: number,
): boolean {
  if (
    !polygon.every((point) => pointInPolygon(point, owner.geometry!)) ||
    polygonEdgesCross(polygon, owner.geometry!)
  ) {
    return false;
  }
  for (const feature of obstacles) {
    const geometry = feature.geometry!;
    if (
      feature.kind === "place" &&
      polygonDistance(geometry[0]!, polygon) < Math.max(10, size * 0.7)
    ) {
      return false;
    }
    if (reservedArea(feature, owner) && polygonsOverlap(polygon, geometry)) {
      return false;
    }
    if (feature.kind !== "road") {
      continue;
    }
    const margin = roadClearance[feature.roadClass ?? "street"] + size * 0.2;
    for (let index = 1; index < geometry.length; index++) {
      const a = geometry[index - 1]!,
        b = geometry[index]!;
      if (
        polygonDistance(a, polygon) < margin ||
        polygonDistance(b, polygon) < margin ||
        polygon.some((point) => segmentDistance(point, a, b) < margin)
      ) {
        return false;
      }
      if (polygonEdgesCross(polygon, [a, b])) {
        return false;
      }
    }
  }
  return true;
}

function decorateRegion(owner: MapFeature, obstacles: MapFeature[]): MapDecoration {
  const decoration: MapDecoration = { buildings: [], trees: [] };
  const [left, bottom, right, top] = geometryBounds(owner.geometry!);
  const vegetation =
    owner.terrain === "park" || ["forest", "meadow"].includes(owner.cartography?.landuse ?? "");
  const size =
    owner.cartography?.buildingSize ?? Math.max(7, Math.sqrt((right - left) * (top - bottom)) / 16);
  const spacing = Math.max(
    size * (vegetation ? 2.6 : 1.9),
    Math.sqrt(((right - left) * (top - bottom)) / 1000),
  );
  const probability = vegetation
    ? 0.7
    : { sparse: 0.4, medium: 0.7, dense: 0.94 }[owner.cartography?.density ?? "medium"];
  const random = seededRandom(`${owner.id}:${owner.cartography?.seed ?? ""}`);
  for (let y = bottom + spacing / 2; y < top; y += spacing) {
    for (let x = left + spacing / 2; x < right; x += spacing) {
      const px = x + (random() - 0.5) * spacing * 0.3,
        py = y + (random() - 0.5) * spacing * 0.3;
      const width = size * (0.7 + random() * 0.55),
        height = size * (0.65 + random() * 0.5);
      const tone = random(),
        keep = random() < probability;
      const polygon: MapPoint[] = [
        [px - width / 2, py - height / 2],
        [px + width / 2, py - height / 2],
        [px + width / 2, py + height / 2],
        [px - width / 2, py + height / 2],
      ];
      if (!keep || !clearFootprint(polygon, owner, obstacles, size)) {
        continue;
      }
      if (vegetation) {
        decoration.trees.push({
          ownerId: owner.id,
          point: [px, py],
          radius: size * (0.18 + tone * 0.15),
        });
      } else {
        decoration.buildings.push({ ownerId: owner.id, geometry: polygon, tone });
      }
    }
  }
  return decoration;
}

/** Decoration has no identity in the story model and is never stored or sent to AI as facts. */
export function generateMapDecoration(features: MapFeature[]): MapDecoration {
  const result: MapDecoration = { buildings: [], trees: [] };
  for (const owner of features) {
    if (
      !owner.geometry ||
      owner.kind !== "region" ||
      (owner.cartography?.layer !== "district" &&
        owner.terrain !== "park" &&
        owner.cartography?.landuse !== "forest")
    ) {
      continue;
    }
    const bounds = geometryBounds(owner.geometry);
    const obstacles = features.filter(
      (feature) =>
        feature !== owner &&
        feature.geometry &&
        boundsOverlap(bounds, geometryBounds(feature.geometry), 30) &&
        (feature.kind !== "region" || reservedArea(feature, owner)),
    );
    const signature = JSON.stringify([
      owner.geometry,
      owner.cartography,
      owner.terrain,
      obstacles
        .map((f) => [
          f.id,
          f.kind,
          f.geometry,
          f.roadClass,
          f.terrain,
          f.cartography?.layer,
          f.parentId,
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ]);
    let stored = cache.get(owner);
    if (stored?.signature !== signature) {
      stored = { signature, decoration: decorateRegion(owner, obstacles) };
      cache.set(owner, stored);
    }
    result.buildings.push(...stored.decoration.buildings);
    result.trees.push(...stored.decoration.trees);
  }
  return result;
}
