import Feature from "ol/Feature.js";
import CircleGeometry from "ol/geom/Circle.js";
import Point from "ol/geom/Point.js";
import Polygon from "ol/geom/Polygon.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import { generateMapDecoration } from "../map-decoration.ts";
import type { MapDocument, MapFeature, MapPoint } from "../map.ts";

const landuseColors = {
  residential: "#e7dbd2",
  commercial: "#dfdcd3",
  civic: "#e5e1cd",
  industrial: "#d9dddd",
  forest: "#cbd8b6",
  farmland: "#e4e5c5",
  meadow: "#e0e8ce",
  sand: "#e9dfbb",
  rock: "#dbd8ce",
} as const;
const terrainColors = {
  land: "#eeeae0",
  water: "#9ecbd5",
  park: "#dce7cc",
  building: "#d6ccb9",
} as const;
const roofs = ["#c69e8d", "#d1b1a0", "#c6c0b1", "#d6cabb", "#bfc9cc"];

export function mapLayer(feature: MapFeature): "terrain" | "district" | "building" {
  return (
    feature.cartography?.layer ??
    (feature.terrain === "water" || feature.terrain === "park" ? "terrain" : "district")
  );
}

export function mapPolygon(points: MapPoint[]): Polygon {
  return new Polygon([[...points, points[0]!]]);
}

export function featureWithStyle(geometry: Polygon | Point | CircleGeometry, style: Style) {
  const feature = new Feature({ geometry });
  feature.setStyle(style);
  return feature;
}

export function regionFeatures(document: MapDocument) {
  const groups = { terrain: [] as Feature[], district: [] as Feature[], building: [] as Feature[] };
  for (const item of document.features) {
    if (item.kind !== "region" || !item.geometry) {
      continue;
    }
    const layer = mapLayer(item);
    const color = item.cartography?.landuse
      ? landuseColors[item.cartography.landuse]
      : terrainColors[item.terrain];
    const outline =
      item.terrain === "water"
        ? "#83b3c0"
        : layer === "building"
          ? "#b8ab94"
          : layer === "district"
            ? "#d2cab8"
            : "#bdcba8";
    const style = new Style({
      fill: new Fill({ color: layer === "district" ? `${color}a6` : color }),
      stroke: new Stroke({
        color: outline,
        width: layer === "building" ? 1.3 : 0.8,
        lineDash: layer === "district" ? [4, 4] : undefined,
      }),
    });
    const feature = featureWithStyle(mapPolygon(item.geometry), style);
    feature.set("mapId", item.id);
    groups[layer].push(feature);
  }
  return groups;
}

export function placeFeatures(document: MapDocument) {
  const places: Feature[] = [];
  for (const item of document.features) {
    if (item.kind !== "place" || !item.geometry) {
      continue;
    }
    const point = featureWithStyle(
      new Point(item.geometry[0]!),
      new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: "#427fa3" }),
          stroke: new Stroke({ color: "#fffdf8", width: 2.5 }),
        }),
      }),
    );
    point.set("mapId", item.id);
    places.push(point);
  }
  return places;
}

/** Decoration geometry matches the production generator; OpenLayers owns rasterization. */
export function decorationFeatures(document: MapDocument) {
  const decoration = generateMapDecoration(document.features);
  const fabric: Feature[] = [];
  const roofDetails: Feature[] = [];
  let totalWidth = 0;
  for (const building of decoration.buildings) {
    const xs = building.geometry.map(([x]) => x);
    const ys = building.geometry.map(([, y]) => y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const shift = Math.min(width, height) * 0.12;
    const color = roofs[Math.floor(building.tone * roofs.length) % roofs.length]!;
    totalWidth += width;
    fabric.push(
      featureWithStyle(
        mapPolygon(building.geometry.map(([x, y]) => [x + shift, y - shift])),
        new Style({ fill: new Fill({ color: "#776c5924" }) }),
      ),
      featureWithStyle(
        mapPolygon(building.geometry),
        new Style({
          fill: new Fill({ color }),
          stroke: new Stroke({ color: "#b2a696", width: 0.45 }),
        }),
      ),
    );
    const roof = building.geometry.map(([x, y]): MapPoint => [
      centerX + (x - centerX) * 0.78,
      centerY + (y - centerY) * 0.78,
    ]);
    roofDetails.push(
      featureWithStyle(
        mapPolygon(roof),
        new Style({
          fill: new Fill({ color: `${color}4d` }),
          stroke: new Stroke({ color: "#a8998766", width: 0.6 }),
        }),
      ),
    );
  }
  for (const tree of decoration.trees) {
    fabric.push(
      featureWithStyle(
        new CircleGeometry(tree.point, tree.radius),
        new Style({
          fill: new Fill({ color: "#9abd7ccc" }),
          stroke: new Stroke({ color: "#7d9f65", width: 0.5 }),
        }),
      ),
    );
  }
  const minimumZoom = decoration.buildings.length
    ? Math.log2((7 * decoration.buildings.length) / totalWidth)
    : Infinity;
  for (const roof of roofDetails) {
    const style = roof.getStyle() as Style;
    roof.setStyle((_feature, resolution) =>
      Math.log2(1 / resolution) >= minimumZoom ? style : undefined,
    );
  }
  return { fabric, roofDetails };
}
