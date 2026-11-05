import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { MapService } from "../map-service.ts";
import type { MapPoint, MapSnapshot } from "../map.ts";
import { MapCanvas } from "./map-canvas.tsx";
import { MapSearch, MapFeatureDetails } from "./map-browser.tsx";
import { MapAgentPanel } from "./map-agent-panel.tsx";
const EMPTY_IDS: string[] = [];

export function MapApp({
  map,
  active,
  onHome,
}: {
  map: MapService;
  active: boolean;
  onHome: () => void;
}) {
  const state = useSyncExternalStore(map.subscribe, map.getSnapshot);
  useEffect(() => {
    void map.prepare();
  }, [map, state.scopeKey]);
  return (
    <MapWorkspace
      key={JSON.stringify([state.chatId, state.scopeKey])}
      service={map}
      state={state}
      active={active}
      onHome={onHome}
    />
  );
}

function MapWorkspace({
  service,
  state,
  active,
  onHome,
}: {
  service: MapService;
  state: MapSnapshot;
  active: boolean;
  onHome: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<MapPoint | null>(null);
  const selectFeature = useCallback((id: string) => {
    setSelectedId(id);
    setSelectedPoint(null);
  }, []);
  const selectPoint = useCallback((point: MapPoint) => {
    setSelectedPoint(point);
    setSelectedId(null);
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
    <div className="map-app">
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
        selectedId={selected?.id ?? null}
        selectedPoint={selectedPoint}
        onClearPoint={() => setSelectedPoint(null)}
      />
    </div>
  );
}
