import type { ModelConnection } from "../model-connections.ts";
export type Wallpaper = { kind: "gradient" } | { kind: "image"; path: string };
export interface PhoneSettings {
  version: 3;
  wallpaper: Wallpaper;
  blur: boolean;
  modelConnections: ModelConnection[];
  defaultModelConnectionId: string | null;
}
export interface PhoneSettingsV2 {
  version: 2;
  wallpaper: Wallpaper;
  blur: boolean;
}
export interface LegacyPhoneSettings {
  version: 1;
  wallpaper: { kind: string; url?: string; label?: string };
  blur: boolean;
  savedUrls: string[];
}
export interface WallpaperImage {
  path: string;
  url: string;
}
export interface SettingsStorage {
  read: () => PhoneSettings | PhoneSettingsV2 | LegacyPhoneSettings | undefined;
  save: (settings: PhoneSettings) => void;
  listWallpapers: () => Promise<WallpaperImage[]>;
  uploadWallpaper: (image: Blob) => Promise<WallpaperImage>;
  imageUrl: (path: string) => string;
}
