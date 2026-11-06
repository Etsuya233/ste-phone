import * as L from "leaflet";
import type { MapFeature } from "../map.ts";
import { cartographicLayer, mapLatLng } from "./map-feature-style.ts";

type LabelDirection = "left" | "right" | "center";
const priority = (feature: MapFeature) =>
  feature.kind === "place"
    ? 4
    : cartographicLayer(feature) === "building"
      ? 3
      : cartographicLayer(feature) === "district"
        ? 2
        : 1;

function reservedLabelSpace(size: L.Point, pendingPlaces: boolean): L.Bounds[] {
  const occupied: L.Bounds[] = [
    L.bounds([12, 12], [size.x - 12, 50]),
    L.bounds([12, 62], [78, 90]),
    L.bounds([size.x - 42, 62], [size.x - 10, 112]),
    L.bounds([size.x - 48, size.y - 82], [size.x - 10, size.y - 10]),
  ];
  if (pendingPlaces) {
    occupied.push(L.bounds([12, size.y - 83], [size.x - 65, size.y - 45]));
  }
  return occupied;
}

/** Label density is based on projected geometry, so maps with different coordinate scales behave alike. */
export function mapLabelPositions(
  map: L.Map,
  features: MapFeature[],
  selectedId: string | null,
): Map<string, LabelDirection> {
  const size = map.getSize();
  const occupied = reservedLabelSpace(
    size,
    features.some((feature) => feature.geometry === null),
  );
  const visible = new Map<string, LabelDirection>();
  const ordered = [...features].sort(
    (a, b) =>
      Number(b.id === selectedId) - Number(a.id === selectedId) || priority(b) - priority(a),
  );
  for (const feature of ordered) {
    if (!feature.geometry) {
      continue;
    }
    const bounds = L.latLngBounds(feature.geometry.map(mapLatLng));
    const screen = map.latLngToContainerPoint(bounds.getCenter());
    const width = feature.name.length * (feature.kind === "place" ? 10.5 : 13);
    const extent = map
      .latLngToContainerPoint(bounds.getNorthEast())
      .distanceTo(map.latLngToContainerPoint(bounds.getSouthWest()));
    if (
      feature.id !== selectedId &&
      feature.kind !== "place" &&
      extent < Math.max(65, width * 1.2)
    ) {
      continue;
    }
    if (feature.kind === "road" && extent < width + 70) {
      continue;
    }
    const direction: LabelDirection =
      feature.kind === "place" ? (screen.x + width + 20 > size.x ? "left" : "right") : "center";
    const left =
      direction === "right"
        ? screen.x + 12
        : direction === "left"
          ? screen.x - width - 12
          : screen.x - width / 2;
    const rectangle = L.bounds([left - 3, screen.y - 9], [left + width + 3, screen.y + 9]);
    if (!occupied.some((entry) => entry.intersects(rectangle))) {
      visible.set(feature.id, direction);
      occupied.push(rectangle);
    }
  }
  return visible;
}

export function attachMapLabel(layer: L.Path, feature: MapFeature): void {
  const label = document.createElement("span");
  label.textContent = feature.name;
  layer.bindTooltip(label, {
    permanent: true,
    direction: "top",
    className: `map-label map-label-${feature.kind} map-label-${feature.kind === "region" ? cartographicLayer(feature) : feature.kind}${feature.terrain === "water" ? " map-label-water" : ""}`,
    opacity: 1,
  });
  layer.on("mouseover", () => {
    if (!layer.getTooltip()!.options.permanent) {
      layer.openTooltip();
    }
  });
  layer.on("mouseout", () => {
    if (!layer.getTooltip()!.options.permanent) {
      layer.closeTooltip();
    }
  });
}

/** A viewport move may reposition a visible label; unchanged selection needs no DOM work. */
export function updateMapLabel(
  layer: L.Path,
  direction: LabelDirection | undefined,
  viewportChanged: boolean,
): void {
  const tooltip = layer.getTooltip()!;
  if (direction === undefined) {
    if (tooltip.options.permanent) {
      tooltip.options.permanent = false;
    }
    if (tooltip.options.direction !== "top") {
      tooltip.options.direction = "top";
    }
    if (tooltip.isOpen()) {
      layer.closeTooltip();
    }
    return;
  }

  const directionChanged = tooltip.options.direction !== direction;
  if (!tooltip.options.permanent) {
    tooltip.options.permanent = true;
  }
  if (directionChanged) {
    tooltip.options.direction = direction;
  }
  if (!tooltip.isOpen()) {
    layer.openTooltip();
  } else if (viewportChanged || directionChanged) {
    // Label text is fixed for this drawing; reposition without replacing its DOM content.
    tooltip.setLatLng(tooltip.getLatLng()!);
  }
}
