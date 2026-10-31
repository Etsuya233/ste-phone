import type { AppId, HomeLayout } from "../../core/launcher/catalog.ts";
export interface HomeScreenSettings {
  getSnapshot(): HomeLayout;
  subscribe(listener: () => void): () => void;
  install(app: AppId): void;
  uninstall(app: AppId): void;
  move(app: AppId, area: "grid" | "dock", index: number): void;
}
export type Wallpaper =
  { readonly kind: "gradient" } | { readonly kind: "image"; readonly path: string };
export interface WallpaperSnapshot {
  readonly wallpaper: Wallpaper;
  readonly blur: boolean;
  readonly url: string | undefined;
}
export interface WallpaperReader {
  getSnapshot(): WallpaperSnapshot;
  subscribe(listener: () => void): () => void;
}
export interface ModelConnectionSummary {
  readonly id: string;
  readonly name: string;
  readonly model: string;
}
export interface ModelConnectionSnapshot extends ModelConnectionSummary {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly customHeaders: Readonly<Record<string, string>>;
}
export interface ModelConnectionsSnapshot {
  readonly connections: readonly ModelConnectionSummary[];
  readonly defaultModelConnectionId: string | null;
}
export interface ModelConnectionsReader {
  getSnapshot(): ModelConnectionsSnapshot;
  subscribe(listener: () => void): () => void;
  /** Explicitly copies credentials for a caller-owned request. */
  getConnection(id: string): ModelConnectionSnapshot;
}
