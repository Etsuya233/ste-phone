import { useEffect, useRef } from "react";
import { unByKey } from "ol/Observable.js";
import type { MapDocument, MapFeature, MapPoint } from "../map.ts";
import { OpenLayersMapScene } from "./map-ol-scene.ts";

interface MapInput {
  document: MapDocument;
  previousFeatures: MapFeature[];
  selectedId: string | null;
  highlightedIds: string[];
  selectedPoint: MapPoint | null;
  queryIds: string[];
  active: boolean;
  onSelect: (id: string) => void;
  onPoint: (point: MapPoint) => void;
}

/** One OL Map per mounted workspace; data and selection have separate update paths. */
export function useOpenLayersMap(input: MapInput) {
  const container = useRef<HTMLDivElement>(null);
  const scene = useRef<OpenLayersMapScene | null>(null);
  const active = useRef(input.active);
  active.current = input.active;
  const pendingView = useRef<
    { kind: "selected"; id: string } | { kind: "query"; ids: string[] } | null
  >(null);
  const callbacks = useRef({ onSelect: input.onSelect, onPoint: input.onPoint });
  callbacks.current = { onSelect: input.onSelect, onPoint: input.onPoint };

  // Hidden workspaces have no usable pixel size. Keep the latest view request until the canvas returns.
  const applyPendingView = () => {
    const current = scene.current;
    const element = container.current;
    if (
      !current ||
      !element ||
      !active.current ||
      element.clientWidth <= 80 ||
      element.clientHeight <= 105 ||
      !pendingView.current
    ) {
      return;
    }
    const intent = pendingView.current;
    current.map.updateSize();
    if (intent.kind === "query") {
      current.fitQuery(intent.ids);
    } else {
      current.panToFeature(intent.id);
    }
    pendingView.current = null;
  };

  useEffect(() => {
    const current = new OpenLayersMapScene(container.current!, input.document);
    scene.current = current;
    let resizeFrame: number | null = null;
    const scheduleResize = () => {
      if (resizeFrame !== null) {
        return;
      }
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null;
        current.map.updateSize();
        applyPendingView();
        current.fitInitial();
      });
    };
    const observer = new ResizeObserver(scheduleResize);
    observer.observe(container.current!);
    const click = current.map.on("singleclick", (event) => {
      const feature = current.map.forEachFeatureAtPixel(
        event.pixel,
        (candidate, layer) => (current.isSemanticLayer(layer) ? candidate : undefined),
        { hitTolerance: 5 },
      );
      const id = feature?.get("mapId") as string | undefined;
      if (id) {
        callbacks.current.onSelect(id);
      } else {
        callbacks.current.onPoint([
          Math.round(event.coordinate[0]!),
          Math.round(event.coordinate[1]!),
        ]);
      }
    });
    scheduleResize();
    return () => {
      observer.disconnect();
      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame);
      }
      unByKey(click);
      current.destroy();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current!.updateDocument(input.document, input.previousFeatures);
  }, [input.document, input.previousFeatures]);
  useEffect(() => {
    scene.current!.updateSelection(input.selectedId, input.highlightedIds, input.selectedPoint);
  }, [input.selectedId, input.highlightedIds, input.selectedPoint]);
  useEffect(() => {
    if (input.selectedId) {
      pendingView.current = { kind: "selected", id: input.selectedId };
      applyPendingView();
    }
  }, [input.selectedId]);
  useEffect(() => {
    if (input.queryIds.length) {
      pendingView.current = { kind: "query", ids: input.queryIds };
      applyPendingView();
    } else if (pendingView.current?.kind === "query") {
      pendingView.current = null;
    }
  }, [input.queryIds]);
  useEffect(() => {
    if (input.active) {
      scene.current!.map.updateSize();
      applyPendingView();
      scene.current!.fitInitial();
    }
  }, [input.active]);

  return { container, fit: () => scene.current!.fit() };
}
