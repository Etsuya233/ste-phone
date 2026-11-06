import * as L from "leaflet";
import type { MapFeature } from "../map.ts";
import {
  cartographicLayer,
  featureStyle,
  interactiveFeature,
  mapLatLng,
  roadStyles,
} from "./map-feature-style.ts";
import { drawBuildingDetails, drawMapDecoration } from "./map-decoration-layers.ts";
import { attachMapLabel, mapLabelPositions, updateMapLabel } from "./map-labels.ts";
import { addSurfaceTexture } from "./map-surface-texture.ts";
import { mapRenderers } from "./map-renderers.ts";

/** Reuses feature paths and decorative Canvas geometry across selection, zoom and panel resizing. */
export class MapDrawing extends L.LayerGroup {
  readonly #map: L.Map;
  readonly #features: MapFeature[];
  readonly #paths = new Map<string, L.Path>();
  readonly #casings = new Map<string, L.Polyline>();
  readonly #decoration: { details: L.LayerGroup; minimumZoom: number };
  #selectedId: string | null = null;
  #highlightedIds: string[] = [];
  #lastZoom: number;
  #refreshFrame: number | null = null;
  constructor(map: L.Map, features: MapFeature[], onSelect: (id: string) => void) {
    super();
    this.#map = map;
    this.#features = features;
    this.#lastZoom = map.getZoom();
    this.addTo(map);
    this.#drawRegions("terrain");
    this.#drawRegions("district");
    this.#decoration = drawMapDecoration(map, this, features);
    this.#drawRegions("building");
    const { roadCasing, road, bridge, poi } = mapRenderers(map);
    for (const feature of features.filter((item) => item.kind === "road" && item.geometry)) {
      // Ground surfaces cover each other's casings at junctions. Bridges retain their edges above them.
      const isBridge = feature.roadClass === "bridge";
      if (feature.roadClass !== "path") {
        const casing = L.polyline(feature.geometry!.map(mapLatLng), {
          ...roadStyles(feature, map.getZoom()).casing,
          renderer: isBridge ? bridge : roadCasing,
        }).addTo(this);
        this.#casings.set(feature.id, casing);
      }
      this.#paths.set(
        feature.id,
        interactiveFeature(feature, false, false, map.getZoom(), isBridge ? bridge : road).addTo(
          this,
        ),
      );
    }
    for (const feature of features.filter((item) => item.kind === "place" && item.geometry)) {
      this.#paths.set(
        feature.id,
        interactiveFeature(feature, false, false, map.getZoom(), poi).addTo(this),
      );
    }
    for (const [id, layer] of this.#paths) {
      layer.on("click", () => onSelect(id));
      attachMapLabel(
        layer,
        features.find((feature) => feature.id === id)!,
      );
    }
    map.on("zoomend moveend resize", this.#scheduleViewportRefresh);
    this.#refreshViewport(false);
  }
  #drawRegions(layerName: "terrain" | "district" | "building"): void {
    const renderer = mapRenderers(this.#map)[layerName === "building" ? "building" : "surface"];
    for (const feature of this.#features.filter(
      (item) => item.kind === "region" && item.geometry && cartographicLayer(item) === layerName,
    )) {
      if (feature.terrain === "water") {
        L.polygon(feature.geometry!.map(mapLatLng), {
          color: "#d9cfad",
          weight: 3.5,
          fill: false,
          interactive: false,
          renderer,
        }).addTo(this);
      }
      if (layerName === "building") {
        const geometry = feature.geometry!.map(([x, y]): [number, number] => [x + 3, y - 3]);
        L.polygon(geometry.map(mapLatLng), {
          stroke: false,
          fillColor: "#7d725c",
          fillOpacity: 0.17,
          interactive: false,
          renderer,
        }).addTo(this);
      }
      const layer = interactiveFeature(feature, false, false, this.#map.getZoom(), renderer).addTo(
        this,
      );
      this.#paths.set(feature.id, layer);
      if (layerName !== "building") {
        addSurfaceTexture(layer, feature);
      }
      if (layerName === "building") {
        drawBuildingDetails(this.#map, this, feature);
      }
    }
  }
  updateSelection(selectedId: string | null, highlightedIds: string[]): void {
    if (
      this.#selectedId === selectedId &&
      this.#highlightedIds.length === highlightedIds.length &&
      this.#highlightedIds.every((id, index) => id === highlightedIds[index])
    ) {
      return;
    }
    const viewportChanged = this.#refreshFrame !== null;
    if (this.#refreshFrame !== null) {
      cancelAnimationFrame(this.#refreshFrame);
      this.#refreshFrame = null;
    }
    this.#selectedId = selectedId;
    this.#highlightedIds = highlightedIds;
    for (const feature of this.#features) {
      const layer = this.#paths.get(feature.id);
      if (!layer) {
        continue;
      }
      layer.setStyle(
        featureStyle(
          feature,
          feature.id === selectedId,
          highlightedIds.includes(feature.id),
          this.#map.getZoom(),
        ),
      );
      if (layer instanceof L.CircleMarker) {
        layer.setRadius(feature.id === selectedId ? 8 : this.#map.getZoom() < -2 ? 4 : 6);
      }
      if (feature.kind === "region" && cartographicLayer(feature) !== "building") {
        addSurfaceTexture(layer, feature);
      }
    }
    this.#refreshViewport(viewportChanged);
  }
  /** Leaflet emits moveend and resize for one size change; draw their final state once per frame. */
  #scheduleViewportRefresh = (): void => {
    if (this.#refreshFrame !== null) {
      return;
    }
    this.#refreshFrame = requestAnimationFrame(() => {
      this.#refreshFrame = null;
      this.#refreshViewport(true);
    });
  };
  #refreshViewport(viewportChanged: boolean): void {
    const zoom = this.#map.getZoom();
    const zoomChanged = zoom !== this.#lastZoom;
    this.#lastZoom = zoom;
    const labels = mapLabelPositions(this.#map, this.#features, this.#selectedId);
    for (const feature of this.#features) {
      const layer = this.#paths.get(feature.id);
      if (!layer) {
        continue;
      }
      if (zoomChanged && feature.kind === "road") {
        layer.setStyle(
          featureStyle(
            feature,
            feature.id === this.#selectedId,
            this.#highlightedIds.includes(feature.id),
            zoom,
          ),
        );
        this.#casings.get(feature.id)?.setStyle(roadStyles(feature, zoom).casing);
      }
      if (zoomChanged && layer instanceof L.CircleMarker) {
        layer.setRadius(feature.id === this.#selectedId ? 8 : zoom < -2 ? 4 : 6);
      }
      updateMapLabel(layer, labels.get(feature.id), viewportChanged);
    }
    if (zoom >= this.#decoration.minimumZoom) {
      if (!this.hasLayer(this.#decoration.details)) {
        this.addLayer(this.#decoration.details);
      }
    } else if (this.hasLayer(this.#decoration.details)) {
      this.removeLayer(this.#decoration.details);
    }
  }
  override onRemove(map: L.Map): this {
    map.off("zoomend moveend resize", this.#scheduleViewportRefresh);
    if (this.#refreshFrame !== null) {
      cancelAnimationFrame(this.#refreshFrame);
      this.#refreshFrame = null;
    }
    super.onRemove(map);
    return this;
  }
}

export function drawPreviousGeometry(
  group: L.LayerGroup,
  previous: MapFeature[],
  current: MapFeature[],
  map: L.Map,
): void {
  for (const feature of previous) {
    if (!feature.geometry) {
      continue;
    }
    interactiveFeature(feature, false, true, map.getZoom(), mapRenderers(map).poi)
      .setStyle({ dashArray: "5 5", opacity: 0.6, fillOpacity: 0.15, interactive: false })
      .addTo(group);
    const next = current.find((entry) => entry.id === feature.id);
    if (next?.geometry) {
      const from = L.latLngBounds(feature.geometry.map(mapLatLng)).getCenter();
      const to = L.latLngBounds(next.geometry.map(mapLatLng)).getCenter();
      L.polyline([from, to], {
        color: "#d38616",
        weight: 2,
        dashArray: "4 5",
        interactive: false,
        renderer: mapRenderers(map).poi,
      }).addTo(group);
    }
  }
}
