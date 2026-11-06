import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import type { MapService } from "../map-service.ts";
import type { MapPoint, MapSnapshot } from "../map.ts";
import { MapCanvas } from "./map-canvas.tsx";
import { MapSearch, MapFeatureDetails } from "./map-browser.tsx";
import { MapAgentPanel } from "./map-agent-panel.tsx";
import { useAgentSheet } from "./use-agent-sheet.ts";
import type { MapModelPreference, ModelConnectionsReader } from "../../settings/public.ts";
import type { MapModelOptions } from "./map-model-selector.tsx";
const EMPTY_IDS: string[] = [];

export function MapApp({
  map,
  connections,
  modelPreference,
  active,
  onHome,
}: {
  map: MapService;
  connections: ModelConnectionsReader;
  modelPreference: MapModelPreference;
  active: boolean;
  onHome: () => void;
}) {
  const state = useSyncExternalStore(map.subscribe, map.getSnapshot);
  const { connections: available } = useSyncExternalStore(
    connections.subscribe,
    connections.getSnapshot,
  );
  const preferredId = useSyncExternalStore(modelPreference.subscribe, modelPreference.getSnapshot);
  const selectedId = available.some((connection) => connection.id === preferredId)
    ? preferredId
    : null;
  useEffect(() => {
    void map.prepare();
  }, [map, state.scopeKey]);
  return (
    <MapWorkspace
      key={JSON.stringify([state.chatId, state.scopeKey])}
      service={map}
      state={state}
      model={{ connections: available, preferredId, selectedId }}
      active={active}
      onHome={onHome}
    />
  );
}

function MapWorkspace({
  service,
  state,
  model,
  active,
  onHome,
}: {
  service: MapService;
  state: MapSnapshot;
  model: MapModelOptions;
  active: boolean;
  onHome: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const sheet = useAgentSheet();
  const selectFeature = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedPoint(null);
  }, []);
  const selectPoint = useCallback((point: MapPoint) => {
    setSelectedPoint(point);
    setSelectedId(null);
  }, []);
  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setSelectedPoint(null);
  }, []);
  const document = state.proposal?.map ?? state.map;
  const selected = document.features.find((feature) => feature.id === selectedId);
  const highlightedIds = state.proposal?.affectedIds ?? state.highlightIds;
  const previousFeatures = useMemo(
    () =>
      state.proposal
        ? state.map.features.filter((feature) => {
            const next = document.features.find((entry) => entry.id === feature.id);
            return !next || JSON.stringify(feature.geometry) !== JSON.stringify(next.geometry);
          })
        : [],
    [state.proposal, state.map, document],
  );
  const pending = document.features.filter((feature) => !feature.geometry);
  return (
    <div
      className="map-app"
      data-agent-size={sheet.size}
      style={{ "--map-agent-height": sheet.cssHeight } as CSSProperties}
    >
      <header className="map-header">
        <button onClick={onHome}>‹ 主屏幕</button>
        <h1>{document.title}</h1>
        <span className="map-revision">{state.proposal ? "预览" : `v${document.revision}`}</span>
      </header>
      <div className="map-world">
        <MapCanvas
          document={document}
          selectedId={selectedId}
          highlightedIds={highlightedIds}
          previousFeatures={previousFeatures}
          selectedPoint={selectedPoint}
          queryIds={state.proposal ? EMPTY_IDS : state.highlightIds}
          active={active}
          onSelect={selectFeature}
          onPoint={selectPoint}
        />
        <MapSearch document={document} query={query} onQuery={setQuery} onSelect={selectFeature} />
        {!document.features.length ? (
          <div className="map-empty">
            <span aria-hidden="true">⌁</span>
            <h2>让世界在这里展开</h2>
            <p>描述一座城、一座岛，或从剧情资料创建第一张地图。</p>
          </div>
        ) : null}
        <div className="map-compass" aria-label="上方为北">
          N<span>↑</span>
        </div>
        {pending.length ? (
          <div className="map-pending">
            <span>位置待定</span>
            {pending.map((feature) => (
              <button key={feature.id} onClick={() => selectFeature(feature.id)}>
                {feature.name}
              </button>
            ))}
          </div>
        ) : null}
        {state.proposal ? <span className="map-preview-badge">修改预览 · 尚未保存</span> : null}
      </div>
      <div className="map-agent-spacer" aria-hidden="true" />
      {selected ? (
        <MapFeatureDetails
          feature={selected}
          document={document}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
      <MapAgentPanel
        service={service}
        state={state}
        model={model}
        sheet={sheet}
        selectedId={selected?.id ?? null}
        selectedName={selected?.name ?? null}
        selectedPoint={selectedPoint}
        onClearPoint={() => setSelectedPoint(null)}
        onClearSelection={clearSelection}
      />
    </div>
  );
}
