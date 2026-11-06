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
        aria-label="地图，可拖动和缩放，点击空白选择位置"
      />
      <button className="map-fit" onClick={map.fit}>
        查看全图
      </button>
    </>
  );
}
