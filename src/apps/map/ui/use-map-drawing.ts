import { useEffect, useRef, type RefObject } from "react";
import * as L from "leaflet";
import type { MapFeature, MapPoint } from "../map.ts";
import { MapDrawing, drawPreviousGeometry } from "./map-layers.ts";
import { mapLatLng } from "./map-feature-style.ts";
import { mapRenderers } from "./map-renderers.ts";

interface DrawingInput {
  map: RefObject<L.Map | null>;
  container: RefObject<HTMLDivElement | null>;
  features: MapFeature[];
  previousFeatures: MapFeature[];
  selectedId: string | null;
  highlightedIds: string[];
  selectedPoint: MapPoint | null;
  onSelect: (id: string) => void;
}

/** Geometry has a longer lifecycle than selection and viewport state. */
export function useMapDrawing(input: DrawingInput): void {
  const drawing = useRef<MapDrawing | null>(null);
  const fitted = useRef(false);
  useEffect(() => {
    const map = input.map.current!;
    const layers = new MapDrawing(map, input.features, input.onSelect);
    drawing.current = layers;
    layers.updateSelection(input.selectedId, input.highlightedIds);
    drawPreviousGeometry(layers, input.previousFeatures, input.features, map);
    const fitInitial = () => {
      const coordinates = input.features.flatMap(
        (feature) => feature.geometry?.map(mapLatLng) ?? [],
      );
      if (
        !fitted.current &&
        coordinates.length &&
        input.container.current!.clientHeight > 0 &&
        input.container.current!.clientWidth > 0
      ) {
        fitted.current = true;
        map.invalidateSize({ pan: false });
        map.fitBounds(L.latLngBounds(coordinates), {
          paddingTopLeft: [35, 70],
          paddingBottomRight: [45, 35],
          maxZoom: 1,
        });
      }
    };
    fitInitial();
    map.on("resize", fitInitial);
    return () => {
      map.off("resize", fitInitial);
      layers.remove();
      drawing.current = null;
    };
  }, [input.features, input.previousFeatures, input.onSelect]);
  useEffect(() => {
    drawing.current!.updateSelection(input.selectedId, input.highlightedIds);
  }, [input.selectedId, input.highlightedIds]);
  useEffect(() => {
    if (!input.selectedPoint) {
      return;
    }
    const layer = L.circleMarker(mapLatLng(input.selectedPoint), {
      radius: 9,
      color: "#007aff",
      weight: 2,
      fillOpacity: 0.2,
      interactive: false,
      renderer: mapRenderers(input.map.current!).poi,
    }).addTo(input.map.current!);
    return () => {
      layer.remove();
    };
  }, [input.selectedPoint]);
}
