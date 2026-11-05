import type { MapPoint, MapSnapshot } from "../map.ts";
import type { MapService } from "../map-service.ts";

export function MapStoryActions({
  service,
  state,
  canRequest,
  selectedId,
  selectedPoint,
}: {
  service: MapService;
  state: MapSnapshot;
  canRequest: boolean;
  selectedId: string | null;
  selectedPoint: MapPoint | null;
}) {
  const busy = state.status !== "idle";
  return (
    <div className="map-agent-shortcuts">
      <button
        disabled={busy || !canRequest}
        onClick={() =>
          void service.request({
            instruction:
              "读取当前剧情资料，检查并更新地图中的地点、区域、道路与事件。保留已有几何，仅提议有依据的变化。",
            selectedId: selectedId ?? undefined,
            selectedPoint: selectedPoint ?? undefined,
            includeStory: true,
          })
        }
      >
        从剧情更新
      </button>
      <button
        disabled={busy || !state.canUndo || !!state.proposal}
        onClick={() => void service.undo()}
      >
        撤销上次应用
      </button>
    </div>
  );
}
