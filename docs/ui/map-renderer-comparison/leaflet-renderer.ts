import * as L from "leaflet";
import type { MapDocument } from "../../../src/apps/map/map.ts";
import { generateMapDecoration } from "../../../src/apps/map/map-decoration.ts";
import { MapDrawing } from "../../../src/apps/map/ui/map-layers.ts";
import { mapLatLng } from "../../../src/apps/map/ui/map-feature-style.ts";
import type { ComparisonRenderer } from "./renderer.ts";

/** Uses the optimized production drawing; only the phone/host shell is omitted. */
export function createLeafletRenderer(
  container: HTMLElement,
  document: MapDocument,
): ComparisonRenderer {
  const map = L.map(container, {
    crs: L.CRS.Simple,
    minZoom: -7,
    maxZoom: 5,
    zoomControl: false,
    attributionControl: false,
    zoomAnimation: false,
    fadeAnimation: false,
    zoomSnap: 0.1,
    zoomDelta: 0.5,
  }).setView([0, 0], 0);
  const drawing = new MapDrawing(map, document.features, () => {});
  const decoration = generateMapDecoration(document.features);
  const coordinates = document.features.flatMap(
    (feature) => feature.geometry?.map(mapLatLng) ?? [],
  );
  const fit = () => {
    map.invalidateSize({ pan: false });
    map.fitBounds(L.latLngBounds(coordinates), {
      paddingTopLeft: [35, 70],
      paddingBottomRight: [45, 35],
      maxZoom: 1,
      animate: false,
    });
  };
  fit();
  return {
    fit,
    zoomBy: (delta) => map.setZoom(map.getZoom() + delta, { animate: false }),
    panBy: (dx, dy) => map.panBy([dx, dy], { animate: false }),
    resize: () => map.invalidateSize({ pan: false }),
    destroy: () => {
      drawing.remove();
      map.remove();
    },
    stats: () => ({
      features: document.features.length,
      buildings: decoration.buildings.length,
      trees: decoration.trees.length,
      centerX: map.getCenter().lng,
      centerY: map.getCenter().lat,
      resolution: 2 ** -map.getZoom(),
      canvas: container.querySelectorAll("canvas").length,
      svg: container.querySelectorAll("svg").length,
      labels: container.querySelectorAll(".leaflet-tooltip").length,
    }),
  };
}
