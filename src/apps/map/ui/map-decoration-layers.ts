import * as L from "leaflet";
import type { MapFeature, MapPoint } from "../map.ts";
import { generateMapDecoration } from "../map-decoration.ts";
import { pointInPolygon, polygonEdgesCross } from "../map-geometry.ts";
import { mapLatLng } from "./map-feature-style.ts";
import { mapRenderers } from "./map-renderers.ts";

const decorations = new WeakMap<MapFeature[], ReturnType<typeof generateMapDecoration>>();
const roofs = ["#c69e8d", "#d1b1a0", "#c6c0b1", "#d6cabb", "#bfc9cc"];

function buildingRoof(
  group: L.LayerGroup,
  details: L.LayerGroup,
  geometry: MapPoint[],
  fill: string,
  renderer: L.Renderer,
): void {
  const bounds = L.latLngBounds(geometry.map(mapLatLng));
  const center = bounds.getCenter();
  const roof = geometry.map(([x, y]): MapPoint => [
    center.lng + (x - center.lng) * 0.78,
    center.lat + (y - center.lat) * 0.78,
  ]);
  const shift =
    Math.min(bounds.getEast() - bounds.getWest(), bounds.getNorth() - bounds.getSouth()) * 0.12;
  const shadow = geometry.map(([x, y]): MapPoint => [x + shift, y - shift]);
  L.polygon(shadow.map(mapLatLng), {
    stroke: false,
    fillColor: "#776c59",
    fillOpacity: 0.14,
    interactive: false,
    renderer,
  }).addTo(group);
  L.polygon(geometry.map(mapLatLng), {
    color: "#b2a696",
    weight: 0.45,
    fillColor: fill,
    fillOpacity: 1,
    interactive: false,
    renderer,
  }).addTo(group);
  L.polygon(roof.map(mapLatLng), {
    color: "#a8998766",
    weight: 0.6,
    fillColor: fill,
    fillOpacity: 0.3,
    interactive: false,
    renderer,
  }).addTo(details);
}

/** Fabric geometry is created once per feature set. Canvas owns all non-interactive texture. */
export function drawMapDecoration(
  map: L.Map,
  group: L.LayerGroup,
  features: MapFeature[],
): { details: L.LayerGroup; minimumZoom: number } {
  let decoration = decorations.get(features);
  if (!decoration) {
    decoration = generateMapDecoration(features);
    decorations.set(features, decoration);
  }
  const renderer = mapRenderers(map).fabric;
  const details = L.layerGroup();
  let totalWidth = 0;
  for (const building of decoration.buildings) {
    const bounds = L.latLngBounds(building.geometry.map(mapLatLng));
    totalWidth += bounds.getEast() - bounds.getWest();
    buildingRoof(
      group,
      details,
      building.geometry,
      roofs[Math.floor(building.tone * roofs.length) % roofs.length]!,
      renderer,
    );
  }
  for (const tree of decoration.trees) {
    L.circle(mapLatLng(tree.point), {
      radius: tree.radius,
      color: "#7d9f65",
      weight: 0.5,
      fillColor: "#9abd7c",
      fillOpacity: 0.8,
      interactive: false,
      renderer,
    }).addTo(group);
  }
  // Insets only appear when an average building is large enough to read as a roof.
  const minimumZoom = decoration.buildings.length
    ? Math.log2((7 * decoration.buildings.length) / totalWidth)
    : Infinity;
  return { details, minimumZoom };
}

export function drawBuildingDetails(map: L.Map, group: L.LayerGroup, feature: MapFeature): void {
  const geometry = feature.geometry!;
  const bounds = L.latLngBounds(geometry.map(mapLatLng));
  const center = bounds.getCenter();
  const rooftop = geometry.map(([x, y]): MapPoint => [
    center.lng + (x - center.lng) * 0.78,
    center.lat + (y - center.lat) * 0.78,
  ]);
  // Concave footprints can reject a centered inset; their real outline remains intact.
  if (
    !rooftop.every((point) => pointInPolygon(point, geometry)) ||
    polygonEdgesCross(rooftop, geometry)
  ) {
    return;
  }
  L.polygon(rooftop.map(mapLatLng), {
    color: "#b29f81",
    weight: 0.7,
    fillColor: "#e2d6be",
    fillOpacity: 0.6,
    interactive: false,
    renderer: mapRenderers(map).building,
  }).addTo(group);
}
