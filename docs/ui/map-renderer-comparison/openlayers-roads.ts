import Feature from "ol/Feature.js";
import type { FeatureLike } from "ol/Feature.js";
import LineString from "ol/geom/LineString.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import type { MapDocument } from "../../../src/apps/map/map.ts";

const roadWidths = { arterial: 14, street: 7, path: 3, bridge: 14 } as const;

export function roadFeatures(document: MapDocument) {
  const casings: Feature[] = [];
  const roads: Feature[] = [];
  const bridges: Feature[] = [];
  for (const item of document.features) {
    if (item.kind !== "road" || !item.geometry) {
      continue;
    }
    const kind = item.roadClass ?? "street";
    const bridge = kind === "bridge";
    const casingStroke = new Stroke({
      color: bridge ? "#a99b7c" : "#d5cbb9",
      width: 1,
      lineCap: bridge ? "butt" : "round",
      lineJoin: "round",
    });
    const surfaceStroke = new Stroke({
      color:
        kind === "arterial"
          ? "#f8edce"
          : bridge
            ? "#e3d4ab"
            : kind === "path"
              ? "#a7a28b"
              : "#fffdf8",
      width: 1,
      lineCap: bridge ? "butt" : "round",
      lineJoin: "round",
    });
    const styleAt = (stroke: Stroke, isCasing: boolean) => {
      const style = new Style({ stroke });
      return (_feature: FeatureLike, resolution: number) => {
        const scale = 1 / resolution;
        const width = Math.max(kind === "path" ? 0.7 : 1.1, roadWidths[kind] * scale);
        stroke.setWidth(width + (isCasing ? Math.max(0.7, (bridge ? 4 : 2) * scale) : 0));
        if (!isCasing && kind === "path") {
          stroke.setLineDash([Math.max(2, 5 * scale), Math.max(3, 7 * scale)]);
        }
        return style;
      };
    };
    const geometry = new LineString(item.geometry);
    if (kind !== "path") {
      const casing = new Feature({ geometry: geometry.clone() });
      casing.setStyle(styleAt(casingStroke, true));
      casings.push(casing);
    }
    const surface = new Feature({ geometry });
    surface.setStyle(styleAt(surfaceStroke, false));
    (bridge ? bridges : roads).push(surface);
  }
  return { casings, roads, bridges };
}
