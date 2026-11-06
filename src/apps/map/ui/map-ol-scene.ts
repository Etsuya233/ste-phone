import type Feature from "ol/Feature.js";
import Map from "ol/Map.js";
import View from "ol/View.js";
import Projection from "ol/proj/Projection.js";
import VectorLayer from "ol/layer/Vector.js";
import VectorSource from "ol/source/Vector.js";
import { boundingExtent } from "ol/extent.js";
import Zoom from "ol/control/Zoom.js";
import type { MapDocument, MapFeature, MapPoint } from "../map.ts";
import { decorationFeatures, placeFeatures, regionFeatures } from "./map-ol-features.ts";
import { createMapLabelLayer } from "./map-ol-labels.ts";
import { previousGeometryFeatures, selectionFeatures } from "./map-ol-overlays.ts";
import { roadFeatures } from "./map-ol-roads.ts";

const projection = new Projection({
  code: "PHONE:PLANAR",
  units: "pixels",
  // Map geometry validation allows coordinates in [-100000, 100000].
  extent: [-200000, -200000, 200000, 200000],
});

export class OpenLayersMapScene {
  readonly map: Map;
  readonly view: View;
  #document: MapDocument;
  #fitted = false;
  #selectedId: string | null = null;
  #highlightedIds: string[] = [];
  #selectedPoint: MapPoint | null = null;
  readonly #terrain = new VectorSource<Feature>();
  readonly #district = new VectorSource<Feature>();
  readonly #fabric = new VectorSource<Feature>();
  readonly #roofs = new VectorSource<Feature>();
  readonly #building = new VectorSource<Feature>();
  readonly #roadCasings = new VectorSource<Feature>();
  readonly #roads = new VectorSource<Feature>();
  readonly #bridgeCasings = new VectorSource<Feature>();
  readonly #bridges = new VectorSource<Feature>();
  readonly #places = new VectorSource<Feature>();
  readonly #previous = new VectorSource<Feature>();
  readonly #selection = new VectorSource<Feature>();
  readonly #hitLayers = new Set<VectorLayer<VectorSource<Feature>>>();
  readonly #labels;

  constructor(container: HTMLElement, document: MapDocument) {
    this.#document = document;
    this.view = new View({
      projection,
      center: [0, 0],
      resolution: 1,
      maxResolution: 128,
      minResolution: 1 / 32,
      constrainResolution: false,
      enableRotation: false,
    });
    const layer = (source: VectorSource<Feature>) => new VectorLayer({ source });
    const terrain = layer(this.#terrain);
    const district = layer(this.#district);
    const building = layer(this.#building);
    const roads = layer(this.#roads);
    const bridges = layer(this.#bridges);
    const places = layer(this.#places);
    this.#hitLayers = new Set([terrain, district, building, roads, bridges, places]);
    this.map = new Map({
      target: container,
      view: this.view,
      controls: [
        new Zoom({
          delta: 0.5,
          zoomInTipLabel: "放大地图",
          zoomOutTipLabel: "缩小地图",
        }),
      ],
      layers: [
        terrain,
        district,
        layer(this.#fabric),
        layer(this.#roofs),
        building,
        layer(this.#roadCasings),
        roads,
        layer(this.#bridgeCasings),
        bridges,
        places,
        layer(this.#previous),
        layer(this.#selection),
      ],
    });
    this.#labels = createMapLabelLayer(this.map);
    this.map.addLayer(this.#labels.layer);
  }

  /** Source replacement keeps the viewport and the Map instance alive across proposals. */
  updateDocument(document: MapDocument, previousFeatures: MapFeature[]): void {
    this.#document = document;
    const regions = regionFeatures(document);
    const roads = roadFeatures(document);
    const decoration = decorationFeatures(document);
    const replace = (source: VectorSource<Feature>, features: Feature[]) => {
      source.clear(true);
      source.addFeatures(features);
    };
    replace(this.#terrain, regions.terrain);
    replace(this.#district, regions.district);
    replace(this.#fabric, decoration.fabric);
    replace(this.#roofs, decoration.roofDetails);
    replace(this.#building, regions.building);
    replace(this.#roadCasings, roads.casings);
    replace(this.#roads, roads.roads);
    replace(this.#bridgeCasings, roads.bridgeCasings);
    replace(this.#bridges, roads.bridges);
    replace(this.#places, placeFeatures(document));
    replace(this.#previous, previousGeometryFeatures(previousFeatures, document.features));
    this.#labels.update(document);
    this.updateSelection(this.#selectedId, this.#highlightedIds, this.#selectedPoint);
    this.fitInitial();
  }

  updateSelection(id: string | null, highlightedIds: string[], point: MapPoint | null): void {
    this.#selectedId = id;
    this.#highlightedIds = highlightedIds;
    this.#selectedPoint = point;
    this.#selection.clear(true);
    this.#selection.addFeatures(
      selectionFeatures(this.#document.features, id, highlightedIds, point),
    );
    this.#labels.select(id);
  }

  fitInitial(): void {
    if (this.#fitted || !this.map.getSize()?.every((size) => size > 0)) {
      return;
    }
    if (this.fit()) {
      this.#fitted = true;
    }
  }

  fit(): boolean {
    const coordinates = this.#document.features.flatMap((feature) => feature.geometry ?? []);
    if (!coordinates.length) {
      return false;
    }
    return this.fitCoordinates(coordinates, [35, 70], [45, 35]);
  }

  fitQuery(ids: string[]): boolean {
    const wanted = new Set(ids);
    const coordinates = this.#document.features
      .filter((feature) => wanted.has(feature.id))
      .flatMap((feature) => feature.geometry ?? []);
    return coordinates.length > 0 && this.fitCoordinates(coordinates, [45, 70], [45, 35]);
  }

  panToFeature(id: string): void {
    const feature = this.#document.features.find((item) => item.id === id);
    if (!feature?.geometry) {
      return;
    }
    const xs = feature.geometry.map(([x]) => x);
    const ys = feature.geometry.map(([, y]) => y);
    this.view.setCenter([
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
    ]);
    this.#fitted = true;
  }

  /** OL owns the fit resolution and asymmetric screen padding. */
  fitCoordinates(points: MapPoint[], topLeft: MapPoint, bottomRight: MapPoint): boolean {
    this.map.updateSize();
    const size = this.map.getSize()!;
    if (size[0]! <= topLeft[0] + bottomRight[0] || size[1]! <= topLeft[1] + bottomRight[1]) {
      return false;
    }
    this.view.fit(boundingExtent(points), {
      size,
      padding: [topLeft[1], bottomRight[0], bottomRight[1], topLeft[0]],
      minResolution: 0.5,
    });
    this.#fitted = true;
    return true;
  }

  destroy(): void {
    this.map.setTarget(undefined);
    this.map.dispose();
  }

  isSemanticLayer(layer: unknown): boolean {
    return this.#hitLayers.has(layer as VectorLayer<VectorSource<Feature>>);
  }
}
