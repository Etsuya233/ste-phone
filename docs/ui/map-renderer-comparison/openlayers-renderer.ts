import Feature from "ol/Feature.js";
import Map from "ol/Map.js";
import View from "ol/View.js";
import CircleGeometry from "ol/geom/Circle.js";
import Point from "ol/geom/Point.js";
import Polygon from "ol/geom/Polygon.js";
import Projection from "ol/proj/Projection.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import CircleStyle from "ol/style/Circle.js";
import Fill from "ol/style/Fill.js";
import Stroke from "ol/style/Stroke.js";
import Style from "ol/style/Style.js";
import Text from "ol/style/Text.js";
import { roadFeatures } from "./openlayers-roads.ts";
import { generateMapDecoration } from "../../../src/apps/map/map-decoration.ts";
import type { MapDocument, MapFeature, MapPoint } from "../../../src/apps/map/map.ts";

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

function layerOf(feature: MapFeature): "terrain" | "district" | "building" {
  return (
    feature.cartography?.layer ??
    (feature.terrain === "water" || feature.terrain === "park" ? "terrain" : "district")
  );
}

function polygon(points: MapPoint[]): Polygon {
  return new Polygon([[...points, points[0]!]]);
}

function featureWithStyle(geometry: Polygon | Point | CircleGeometry, style: Style) {
  const feature = new Feature({ geometry });
  feature.setStyle(style);
  return feature;
}

function regionFeatures(document: MapDocument) {
  const groups = { terrain: [] as Feature[], district: [] as Feature[], building: [] as Feature[] };
  for (const item of document.features) {
    if (item.kind !== "region" || !item.geometry) {
      continue;
    }
    const layer = layerOf(item);
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
    groups[layer].push(featureWithStyle(polygon(item.geometry), style));
  }
  return groups;
}

function decorationFeatures(document: MapDocument) {
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
        polygon(building.geometry.map(([x, y]) => [x + shift, y - shift])),
        new Style({ fill: new Fill({ color: "#776c5924" }) }),
      ),
      featureWithStyle(
        polygon(building.geometry),
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
        polygon(roof),
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
  return { fabric, roofDetails, minimumZoom, decoration };
}

function labelFeatures(document: MapDocument) {
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
    const layer = item.kind === "region" ? layerOf(item) : item.kind;
    const priority =
      item.kind === "place" ? 4 : layer === "building" ? 3 : layer === "district" ? 2 : 1;
    const text = new Text({
      text: item.name,
      font: `${item.kind === "place" ? 600 : 500} ${item.kind === "road" ? 9 : layer === "district" ? 13 : 11}px -apple-system, BlinkMacSystemFont, sans-serif`,
      fill: new Fill({ color: item.terrain === "water" ? "#628c9a" : "#454c49" }),
      stroke: new Stroke({ color: "#ffffff", width: 3 }),
      offsetX: item.kind === "place" ? 12 : 0,
      textAlign: item.kind === "place" ? "left" : "center",
      overflow: true,
      padding: [2, 3, 2, 3],
    });
    const label = featureWithStyle(new Point(center), new Style({ text }));
    label.set("priority", priority);
    labels.push(label);
  }
  return labels;
}

/** Independent Canvas comparison. OL owns hit testing and label decluttering. */
export function createOpenLayersRenderer(container: HTMLElement, document: MapDocument) {
  const coordinates = document.features.flatMap((item) => item.geometry ?? []);
  if (!coordinates.length) {
    throw new Error("OpenLayers 对照图没有可见几何");
  }
  const xs = coordinates.map(([x]) => x);
  const ys = coordinates.map(([, y]) => y);
  const extent: [number, number, number, number] = [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ];
  const padding = Math.max(extent[2] - extent[0], extent[3] - extent[1], 1000) * 4;
  const projection = new Projection({
    code: "PHONE:PLANAR",
    units: "pixels",
    extent: [extent[0] - padding, extent[1] - padding, extent[2] + padding, extent[3] + padding],
  });
  const regions = regionFeatures(document);
  const roads = roadFeatures(document);
  const detail = decorationFeatures(document);
  const places = document.features
    .filter((item) => item.kind === "place" && item.geometry)
    .map((item) =>
      featureWithStyle(
        new Point(item.geometry![0]!),
        new Style({
          image: new CircleStyle({
            radius: 6,
            fill: new Fill({ color: "#427fa3" }),
            stroke: new Stroke({ color: "#fffdf8", width: 2.5 }),
          }),
        }),
      ),
    );
  const labels = labelFeatures(document);
  const vector = (features: Feature[]) =>
    new VectorLayer({ source: new VectorSource({ features }) });
  const view = new View({
    projection,
    center: [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2],
    resolution: 1,
    maxResolution: 128,
    minResolution: 0.5,
    constrainResolution: false,
    enableRotation: false,
  });
  const map = new Map({
    target: container,
    view,
    controls: [],
    layers: [
      vector(regions.terrain),
      vector(regions.district),
      vector(detail.fabric),
      vector(detail.roofDetails),
      vector(regions.building),
      vector(roads.casings),
      vector(roads.roads),
      vector(roads.bridges),
      vector(places),
      new VectorLayer({
        source: new VectorSource({ features: labels }),
        declutter: true,
        renderOrder: (a, b) => Number(b.get("priority")) - Number(a.get("priority")),
      }),
    ],
  });
  const fit = () => {
    map.updateSize();
    const size = map.getSize()!;
    const width = size[0]!;
    const height = size[1]!;
    const scale = Math.min(
      (width - 80) / (extent[2] - extent[0]),
      (height - 105) / (extent[3] - extent[1]),
    );
    // Leaflet's zoomSnap=0.1 rounds at 0.001 before snapping down to a tenth.
    const zoom = Math.max(
      -7,
      Math.min(1, Math.floor(Math.round(Math.log2(scale) * 1000) / 100) / 10),
    );
    const resolution = 2 ** -zoom;
    view.setResolution(resolution);
    view.setCenter([
      (extent[0] + extent[2]) / 2 + 5 * resolution,
      (extent[1] + extent[3]) / 2 + 17.5 * resolution,
    ]);
  };
  fit();
  return {
    fit,
    zoomBy(delta: number) {
      view.adjustResolution(2 ** -delta);
    },
    panBy(dx: number, dy: number) {
      const center = view.getCenter()!;
      const resolution = view.getResolution()!;
      view.setCenter([center[0]! + dx * resolution, center[1]! - dy * resolution]);
    },
    resize() {
      map.updateSize();
    },
    destroy() {
      map.setTarget(undefined);
      map.dispose();
    },
    stats(): Record<string, number> {
      const center = view.getCenter()!;
      return {
        centerX: center[0]!,
        centerY: center[1]!,
        resolution: view.getResolution()!,
        features: document.features.length,
        semanticFeatures: document.features.length,
        visibleFeatures: document.features.filter((item) => item.geometry).length,
        roads: roads.roads.length + roads.bridges.length,
        places: places.length,
        regions: regions.terrain.length + regions.district.length + regions.building.length,
        buildings: detail.decoration.buildings.length,
        trees: detail.decoration.trees.length,
        decorationBuildings: detail.decoration.buildings.length,
        decorationTrees: detail.decoration.trees.length,
        labelCandidates: labels.length,
        canvasCount: container.querySelectorAll("canvas").length,
        olFeatures:
          document.features.filter((item) => item.geometry).length +
          roads.casings.length +
          detail.fabric.length +
          detail.roofDetails.length +
          labels.length,
      };
    },
  };
}
