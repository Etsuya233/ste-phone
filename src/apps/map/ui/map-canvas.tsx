import { useEffect, useRef } from "react";
import * as L from "leaflet";
import type { MapDocument, MapFeature, MapPoint } from "../map.ts";
import { mapLatLng } from "./map-feature-style.ts";
import { useMapDrawing } from "./use-map-drawing.ts";
import { useLeafletViewport } from "./use-leaflet-viewport.ts";

interface MapCanvasProps {
  document: MapDocument;
  selectedId: string | null;
  selectedPoint: MapPoint | null;
  highlightedIds: string[];
  previousFeatures: MapFeature[];
  queryIds: string[];
  active: boolean;
  onSelect: (id: string) => void;
  onPoint: (point: MapPoint) => void;
}

export function MapCanvas({
  document,
  selectedId,
  selectedPoint,
  highlightedIds,
  previousFeatures,
  queryIds,
  active,
  onSelect,
  onPoint,
}: MapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useLeafletViewport(container, active);
  useMapDrawing({
    map: mapRef,
    container,
    features: document.features,
    previousFeatures,
    selectedId,
    highlightedIds,
    selectedPoint,
    onSelect,
  });
  useEffect(() => {
    const map = mapRef.current!;
    const selectPoint = (event: L.LeafletMouseEvent) =>
      onPoint([Math.round(event.latlng.lng), Math.round(event.latlng.lat)]);
    map.on("click", selectPoint);
    return () => {
      map.off("click", selectPoint);
    };
  }, [onPoint]);
  useEffect(() => {
    const feature = document.features.find((entry) => entry.id === selectedId);
    if (feature?.geometry) {
      mapRef.current!.panTo(L.latLngBounds(feature.geometry.map(mapLatLng)).getCenter(), {
        animate: false,
      });
    }
  }, [selectedId]);
  useEffect(() => {
    const coordinates = document.features
      .filter((feature) => queryIds.includes(feature.id))
      .flatMap((feature) => feature.geometry?.map(mapLatLng) ?? []);
    if (coordinates.length) {
      mapRef.current!.fitBounds(L.latLngBounds(coordinates), {
        paddingTopLeft: [45, 70],
        paddingBottomRight: [45, 35],
        maxZoom: 1,
      });
    }
  }, [queryIds]);
  return (
    <>
      <div
        className="map-canvas"
        ref={container}
        aria-label="地图，可拖动和缩放，点击空白选择位置"
      />
      <button
        className="map-fit"
        onClick={() => {
          const coordinates = document.features.flatMap(
            (feature) => feature.geometry?.map(mapLatLng) ?? [],
          );
          if (coordinates.length) {
            mapRef.current!.fitBounds(L.latLngBounds(coordinates), {
              paddingTopLeft: [35, 70],
              paddingBottomRight: [45, 35],
              maxZoom: 1,
            });
          }
        }}
      >
        查看全图
      </button>
    </>
  );
}
