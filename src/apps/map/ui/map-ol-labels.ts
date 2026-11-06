import Feature from "ol/Feature.js";
import type Map from "ol/Map.js";
import Point from "ol/geom/Point.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import Text from "ol/style/Text.js";
import type { MapDocument, MapPoint } from "../map.ts";
import { mapLayer } from "./map-ol-features.ts";

/** Labels use OL decluttering; selected labels have first claim on overlap space. */
export function createMapLabelLayer(map: Map) {
  const source = new VectorSource<Feature>();
  const measure = globalThis.document.createElement("canvas").getContext("2d")!;
  let selectedId: string | null = null;
  const layer = new VectorLayer({
    source,
    declutter: true,
    renderOrder: (a, b) =>
      Number(b.get("mapId") === selectedId) - Number(a.get("mapId") === selectedId) ||
      Number(b.get("priority")) - Number(a.get("priority")),
  });

  return {
    layer,
    update(document: MapDocument) {
      const labels: Feature[] = [];
      for (const item of document.features) {
        if (!item.geometry) {
          continue;
        }
        const xs = item.geometry.map(([x]) => x);
        const ys = item.geometry.map(([, y]) => y);
        const center: MapPoint = [
          (Math.min(...xs) + Math.max(...xs)) / 2,
          (Math.min(...ys) + Math.max(...ys)) / 2,
        ];
        const feature = new Feature({ geometry: new Point(center) });
        const regionLayer = item.kind === "region" ? mapLayer(item) : item.kind;
        feature.set("mapId", item.id);
        feature.set(
          "priority",
          item.kind === "place"
            ? 4
            : regionLayer === "building"
              ? 3
              : regionLayer === "district"
                ? 2
                : 1,
        );
        const font = `${item.kind === "place" ? 600 : 500} ${item.kind === "road" ? 9 : regionLayer === "district" ? 13 : 11}px -apple-system, BlinkMacSystemFont, sans-serif`;
        measure.font = font;
        const fullWidth = measure.measureText(item.name).width;
        const text = new Text({
          text: item.name,
          font,
          fill: new Fill({ color: item.terrain === "water" ? "#628c9a" : "#454c49" }),
          stroke: new Stroke({ color: "#ffffff", width: 3 }),
          overflow: true,
          padding: [2, 3, 2, 3],
        });
        const style = new Style({ text });
        feature.setStyle(() => {
          const pixel = map.getPixelFromCoordinate(center);
          const size = map.getSize();
          const width = size?.[0] ?? 0;
          const height = size?.[1] ?? 0;
          // 全图与缩放控件固定在右下角，标签不得压到按钮下面。
          if (pixel[0]! > width - 56 && pixel[1]! > height - 118) {
            return undefined;
          }
          let available: number;
          if (item.kind === "place") {
            const left = width - pixel[0]! - 20 < fullWidth && pixel[0]! > width - pixel[0]!;
            text.setTextAlign(left ? "right" : "left");
            text.setOffsetX(left ? -12 : 12);
            available = left ? pixel[0]! - 20 : width - pixel[0]! - 20;
          } else {
            available = 2 * Math.min(pixel[0]!, width - pixel[0]!) - 16;
          }
          if (available < 24) {
            return undefined;
          }
          // Limit text to its visible side; OL still decides collisions between candidates.
          let label = item.name;
          if (fullWidth > available) {
            measure.font = font;
            while (label.length > 1 && measure.measureText(`${label}…`).width > available) {
              label = label.slice(0, -1);
            }
            label += "…";
          }
          if (text.getText() !== label) {
            text.setText(label);
          }
          return style;
        });
        labels.push(feature);
      }
      source.clear(true);
      source.addFeatures(labels);
    },
    select(id: string | null) {
      if (selectedId === id) {
        return;
      }
      selectedId = id;
      layer.changed();
    },
  };
}
