import type { MapDocument } from "../../../src/apps/map/map.ts";

export interface ComparisonRenderer {
  fit(): void;
  zoomBy(delta: number): void;
  panBy(dx: number, dy: number): void;
  resize(): void;
  destroy(): void;
  stats(): Record<string, number>;
}

export type RendererFactory = (container: HTMLElement, document: MapDocument) => ComparisonRenderer;
