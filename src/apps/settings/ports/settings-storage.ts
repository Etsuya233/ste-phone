import type { ModelConnection } from "../model-connections.ts";
import type { HomeLayout } from "../../../core/launcher/catalog.ts";
export type Wallpaper = { kind: "gradient" } | { kind: "image"; path: string };
export interface PhoneSettings {
  version: 4;
  wallpaper: Wallpaper;
  blur: boolean;
  modelConnections: ModelConnection[];
  defaultModelConnectionId: string | null;
  homeLayout: HomeLayout;
}
export interface PhoneSettingsV3 extends Omit<PhoneSettings, "version" | "homeLayout"> {
  version: 3;
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
  read: () => PhoneSettings | PhoneSettingsV3 | PhoneSettingsV2 | LegacyPhoneSettings | undefined;
  save: (settings: PhoneSettings) => void;
  listWallpapers: () => Promise<WallpaperImage[]>;
  uploadWallpaper: (image: Blob) => Promise<WallpaperImage>;
  imageUrl: (path: string) => string;
}
