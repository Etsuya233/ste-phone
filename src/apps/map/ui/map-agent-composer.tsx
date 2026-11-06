import type { MapPoint, MapSnapshot } from "../map.ts";
import type { MapService } from "../map-service.ts";
import { MapModelSelector, type MapModelOptions } from "./map-model-selector.tsx";

export function MapAgentComposer({
  service,
  state,
  model,
  selectedName,
  selectedPoint,
  instruction,
  onInstruction,
  onSubmit,
  onClearPoint,
  onClearSelection,
}: {
  service: MapService;
  state: MapSnapshot;
  model: MapModelOptions;
  selectedName: string | null;
  selectedPoint: MapPoint | null;
  instruction: string;
  onInstruction: (value: string) => void;
  onSubmit: () => void;
  onClearPoint: () => void;
  onClearSelection: () => void;
}) {
  const busy = state.status !== "idle";
  const canRequest = model.selectedId !== null;
  return (
    <div className="map-agent-composer">
      {selectedName ? (
        <div className="map-context">
          针对「{selectedName}」<button onClick={onClearSelection}>清除</button>
        </div>
      ) : null}
      {selectedPoint ? (
        <div className="map-context">
          选中位置 ({selectedPoint.join(", ")})<button onClick={onClearPoint}>清除</button>
        </div>
      ) : null}
      <div className="map-composer-meta">
        <MapModelSelector model={model} service={service} disabled={busy} />
        {state.canUndo ? (
          <button
            className="map-undo"
            disabled={busy || !!state.proposal}
            onClick={() => void service.undo()}
          >
            撤销上次应用
          </button>
        ) : null}
      </div>
      <div className="map-composer-field">
        <textarea
          aria-label="地图指令"
          value={instruction}
          onChange={(event) => onInstruction(event.target.value)}
          placeholder={state.proposal ? "继续描述想调整的地方…" : "描述你的世界，或询问地点与路线…"}
          rows={2}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              onSubmit();
            }
          }}
        />
        <button
          className="map-send"
          aria-label={state.proposal ? "继续调整" : "发送"}
          disabled={busy || !canRequest || !instruction.trim()}
          onClick={onSubmit}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
