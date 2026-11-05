import { useState } from "react";
import type { MapPoint, MapSnapshot } from "../map.ts";
import type { MapService } from "../map-service.ts";
import { MapStoryTables } from "./map-story-tables.tsx";
import { MapStoryActions } from "./map-story-actions.tsx";

export function MapAgentPanel({
  service,
  state,
  selectedId,
  selectedPoint,
  onClearPoint,
}: {
  service: MapService;
  state: MapSnapshot;
  selectedId: string | null;
  selectedPoint: MapPoint | null;
  onClearPoint: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [instruction, setInstruction] = useState("");
  const [includeStory, setIncludeStory] = useState(false);
  const busy = state.status !== "idle";
  const selected = (state.proposal?.map ?? state.map).features.find(
    (feature) => feature.id === selectedId,
  );
  const submit = () => {
    if (!instruction.trim() || busy) {
      return;
    }
    void service.request({
      instruction,
      selectedId: selectedId ?? undefined,
      selectedPoint: selectedPoint ?? undefined,
      includeStory,
    });
  };
  return (
    <section className="map-agent" aria-label="地图助手">
      <button
        className="map-agent-toggle"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <span className="map-agent-grip" />
        <span>地图助手</span>
        <span className="map-agent-state">
          {busy
            ? { reading: "读取资料中…", generating: "正在构思…", saving: "保存中…", idle: "" }[
                state.status
              ]
            : state.proposal
              ? "有待确认的修改"
              : expanded
                ? "收起⌄"
                : "展开⌃"}
        </span>
      </button>
      {expanded ? (
        <div className="map-agent-content">
          {selected ? <div className="map-context">针对「{selected.name}」</div> : null}
          {selectedPoint ? (
            <div className="map-context">
              选中位置 ({selectedPoint.join(", ")})<button onClick={onClearPoint}>清除</button>
            </div>
          ) : null}
          {state.proposal ? <MapProposalCard service={service} state={state} /> : null}
          {state.answer ? <p className="map-answer">{state.answer}</p> : null}
          {state.error ? (
            <p className="map-error" role="alert">
              {state.error.message}
            </p>
          ) : null}
          <textarea
            aria-label="地图指令"
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder={
              state.proposal ? "继续描述想调整的地方…" : "描述你的世界，或询问地点与路线…"
            }
            rows={2}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <div className="map-compose-tools">
            <label>
              <input
                type="checkbox"
                checked={includeStory}
                onChange={(event) => setIncludeStory(event.target.checked)}
                disabled={busy}
              />
              附加剧情资料
            </label>
            {busy && state.status !== "saving" ? (
              <button onClick={() => service.cancel()}>停止</button>
            ) : (
              <button
                className="map-primary"
                disabled={busy || !instruction.trim()}
                onClick={submit}
              >
                {state.proposal ? "继续调整" : "发送"}
              </button>
            )}
          </div>
          <MapStoryTables service={service} state={state} />
          <MapStoryActions
            service={service}
            state={state}
            selectedId={selectedId}
            selectedPoint={selectedPoint}
          />
        </div>
      ) : null}
    </section>
  );
}

function MapProposalCard({ service, state }: { service: MapService; state: MapSnapshot }) {
  const busy = state.status !== "idle";
  return (
    <div className="map-proposal">
      <strong>修改预览</strong>
      <p>{state.proposal!.summary}</p>
      <span className="map-caption">金色标出本次影响的要素，确认后保存。</span>
      <div className="map-actions">
        <button className="map-primary" disabled={busy} onClick={() => void service.apply()}>
          应用修改
        </button>
        <button disabled={busy} onClick={() => service.discard()}>
          放弃
        </button>
      </div>
    </div>
  );
}
