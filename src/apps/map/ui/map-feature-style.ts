import * as L from "leaflet";
import type { MapFeature, MapPoint } from "../map.ts";

export const mapLatLng = ([x, y]: MapPoint): L.LatLngTuple => [y, x];
export const landuseColors = {
  residential: "#e7dbd2",
  commercial: "#dfdcd3",
  civic: "#e5e1cd",
  industrial: "#d9dddd",
  forest: "#cbd8b6",
  farmland: "#e4e5c5",
  meadow: "#e0e8ce",
  sand: "#e9dfbb",
  rock: "#dbd8ce",
};
const terrainColors = { land: "#eeeae0", water: "#9ecbd5", park: "#dce7cc", building: "#d6ccb9" };

export function cartographicLayer(feature: MapFeature): "terrain" | "district" | "building" {
  return (
    feature.cartography?.layer ??
    (feature.terrain === "water" || feature.terrain === "park" ? "terrain" : "district")
  );
}

export function regionStyle(feature: MapFeature): L.PathOptions {
  const layer = cartographicLayer(feature);
  const fillColor = feature.cartography?.landuse
    ? landuseColors[feature.cartography.landuse]
    : terrainColors[feature.terrain];
  return {
    fillColor,
    fillOpacity: layer === "district" ? 0.65 : 1,
    color:
      feature.terrain === "water"
        ? "#83b3c0"
        : layer === "building"
          ? "#b8ab94"
          : layer === "district"
            ? "#d2cab8"
            : "#bdcba8",
    weight: layer === "building" ? 1.3 : 0.8,
    dashArray: layer === "district" ? "4 4" : undefined,
    className: `map-region map-region-${layer}`,
    bubblingMouseEvents: false,
  };
}

export function roadStyles(
  feature: MapFeature,
  zoom: number,
): { casing: L.PolylineOptions; surface: L.PolylineOptions } {
  const kind = feature.roadClass ?? "street";
  const widths = { arterial: 14, street: 7, path: 3, bridge: 14 };
  const scale = 2 ** zoom;
  const width = Math.max(kind === "path" ? 0.7 : 1.1, widths[kind] * scale);
  return {
    casing: {
      color: kind === "bridge" ? "#a99b7c" : "#d5cbb9",
      weight: width + Math.max(0.7, (kind === "bridge" ? 4 : 2) * scale),
      lineCap: kind === "bridge" ? "butt" : "round",
      interactive: false,
      className: kind === "bridge" ? "map-bridge-shadow" : "map-road-casing",
    },
    surface: {
      color:
        kind === "arterial"
          ? "#f8edce"
          : kind === "bridge"
            ? "#e3d4ab"
            : kind === "path"
              ? "#a7a28b"
              : "#fffdf8",
      weight: width,
      dashArray:
        kind === "path" ? `${Math.max(2, 5 * scale)} ${Math.max(3, 7 * scale)}` : undefined,
      lineCap: kind === "bridge" ? "butt" : "round",
      bubblingMouseEvents: false,
    },
  };
}

export function featureStyle(
  feature: MapFeature,
  selected: boolean,
  highlighted: boolean,
  zoom: number,
): L.PathOptions {
  const accent = highlighted ? "#d58b22" : "#387fb1";
  if (feature.kind === "place") {
    return {
      color: "#fffdf8",
      weight: selected ? 3 : 2.5,
      fillColor: highlighted ? "#d58b22" : selected ? "#236189" : "#427fa3",
      fillOpacity: 1,
      bubblingMouseEvents: false,
      className: "map-poi",
    };
  }
  const style = feature.kind === "road" ? roadStyles(feature, zoom).surface : regionStyle(feature);
  return selected || highlighted
    ? { ...style, color: accent, weight: feature.kind === "road" ? Number(style.weight) + 2 : 2.5 }
    : style;
}

export function interactiveFeature(
  feature: MapFeature,
  selected: boolean,
  highlighted: boolean,
  zoom = 0,
  renderer?: L.Renderer,
): L.Path {
  const geometry = feature.geometry!;
  const options = { ...featureStyle(feature, selected, highlighted, zoom), renderer };
  if (feature.kind === "place") {
    return L.circleMarker(mapLatLng(geometry[0]!), {
      ...options,
      radius: selected ? 8 : zoom < -2 ? 4 : 6,
    });
  }
  return feature.kind === "road"
    ? L.polyline(geometry.map(mapLatLng), options)
    : L.polygon(geometry.map(mapLatLng), options);
}
