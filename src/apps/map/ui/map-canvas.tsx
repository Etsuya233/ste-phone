import type { MapDocument, MapFeature, MapPoint } from "../map.ts";
import { useOpenLayersMap } from "./use-openlayers-map.ts";

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

export function MapCanvas(props: MapCanvasProps) {
  const map = useOpenLayersMap(props);
  return (
    <>
      <div
        className="map-canvas"
        ref={map.container}
        aria-label="地图，上方为北，可拖动和缩放，点击空白选择位置"
      />
      <button className="map-fit" onClick={map.fit} aria-label="查看全图" title="查看全图">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
        </svg>
      </button>
    </>
  );
}
