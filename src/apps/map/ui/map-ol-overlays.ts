import Feature from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import Point from "ol/geom/Point.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import type { MapFeature, MapPoint } from "../map.ts";
import { mapPolygon } from "./map-ol-features.ts";

function centerOf(feature: MapFeature): MapPoint {
  const points = feature.geometry!;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

/** Proposal comparison is visual only; the candidate document remains the authority. */
export function previousGeometryFeatures(previous: MapFeature[], current: MapFeature[]) {
  const result: Feature[] = [];
  const currentById = new Map(current.map((feature) => [feature.id, feature]));
  for (const before of previous) {
    if (!before.geometry) {
      continue;
    }
    const geometry =
      before.kind === "place"
        ? new Point(before.geometry[0]!)
        : before.kind === "road"
          ? new LineString(before.geometry)
          : mapPolygon(before.geometry);
    const feature = new Feature({ geometry });
    feature.setStyle(
      new Style({
        image:
          before.kind === "place"
            ? new CircleStyle({
                radius: 6,
                fill: new Fill({ color: "#d3861626" }),
                stroke: new Stroke({ color: "#d38616", width: 2, lineDash: [5, 5] }),
              })
            : undefined,
        fill: before.kind === "region" ? new Fill({ color: "#d3861626" }) : undefined,
        stroke:
          before.kind !== "place"
            ? new Stroke({ color: "#d38616", width: 2, lineDash: [5, 5] })
            : undefined,
      }),
    );
    result.push(feature);
    const after = currentById.get(before.id);
    if (after?.geometry) {
      const connector = new Feature({
        geometry: new LineString([centerOf(before), centerOf(after)]),
      });
      connector.setStyle(
        new Style({ stroke: new Stroke({ color: "#d38616", width: 2, lineDash: [4, 5] }) }),
      );
      result.push(connector);
    }
  }
  return result;
}

export function selectionFeatures(
  features: MapFeature[],
  selectedId: string | null,
  highlightedIds: string[],
  selectedPoint: MapPoint | null,
) {
  const result: Feature[] = [];
  const highlighted = new Set(highlightedIds);
  for (const item of features) {
    if (!item.geometry || (item.id !== selectedId && !highlighted.has(item.id))) {
      continue;
    }
    const color = highlighted.has(item.id) ? "#d58b22" : "#387fb1";
    const geometry =
      item.kind === "place"
        ? new Point(item.geometry[0]!)
        : item.kind === "road"
          ? new LineString(item.geometry)
          : mapPolygon(item.geometry);
    const overlay = new Feature({ geometry });
    if (item.kind === "place") {
      const pin = new Style({
        image: new CircleStyle({
          radius: item.id === selectedId ? 8 : 6,
          fill: new Fill({ color }),
          stroke: new Stroke({ color: "#fffdf8", width: item.id === selectedId ? 3 : 2.5 }),
        }),
      });
      // 选中点追加一圈淡蓝光晕，避免只靠填充色表达状态。
      const halo = new Style({
        image: new CircleStyle({
          radius: 14,
          fill: new Fill({ color: "#387fb11a" }),
          stroke: new Stroke({ color: "#387fb159", width: 1.2 }),
        }),
      });
      overlay.setStyle(item.id === selectedId ? [halo, pin] : pin);
    } else {
      overlay.setStyle(
        new Style({
          stroke: new Stroke({ color, width: item.kind === "road" ? 5 : 2.5 }),
        }),
      );
    }
    result.push(overlay);
  }
  if (selectedPoint) {
    const point = new Feature({ geometry: new Point(selectedPoint) });
    // The coordinate marker uses screen pixels like Leaflet's circleMarker.
    point.setStyle(
      new Style({
        image: new CircleStyle({
          radius: 9,
          fill: new Fill({ color: "#007aff33" }),
          stroke: new Stroke({ color: "#007aff", width: 2 }),
        }),
      }),
    );
    result.push(point);
  }
  return result;
}
