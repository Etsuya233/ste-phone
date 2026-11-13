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
export interface BrowserModelPreference {
  getSnapshot(): string | null;
  subscribe(listener: () => void): () => void;
  select(id: string): void;
}
export interface MapModelPreference {
  getSnapshot(): string | null;
  subscribe(listener: () => void): () => void;
  select(id: string): void;
}
export interface ModelConnectionsReader {
  getSnapshot(): ModelConnectionsSnapshot;
  subscribe(listener: () => void): () => void;
  /** Explicitly copies credentials for a caller-owned request. */
  getConnection(id: string): ModelConnectionSnapshot;
}

export type WechatSendMode = "immediate" | "delayed";
export interface WechatPreferences {
  getSnapshot(): WechatSendMode;
  subscribe(listener: () => void): () => void;
  setSendMode(mode: WechatSendMode): void;
  getHistoryMessageLimit(): number;
  setHistoryMessageLimit(limit: number): void;
}

export type DeviceModel = "iphone-6s" | "iphone-17";
export const systemStyles = ["classic", "ios26", "material3"] as const;
export type SystemStyle = (typeof systemStyles)[number];

export function isSystemStyle(value: unknown): value is SystemStyle {
  return systemStyles.some((style) => style === value);
}
export interface AppearanceSnapshot {
  readonly deviceModel: DeviceModel;
  readonly systemStyle: SystemStyle;
}
export interface AppearanceSettings {
  getSnapshot(): AppearanceSnapshot;
  subscribe(listener: () => void): () => void;
  setDeviceModel(value: DeviceModel): void;
  setSystemStyle(value: SystemStyle): void;
}
export type { PhoneSettingsService } from "./settings-service.ts";
