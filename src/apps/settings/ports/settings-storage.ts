import type { AppearanceSnapshot, WechatSendMode } from "../public.ts";
import type { ModelConnection } from "../model-connections.ts";
import type { HomeLayout } from "../../../core/launcher/catalog.ts";
export type Wallpaper = { kind: "gradient" } | { kind: "image"; path: string };
export interface PhoneSettings {
  version: 7;
  appearance: AppearanceSnapshot;
  wechatHistoryMessageLimit: number;
  wechatSendMode: WechatSendMode;
  wallpaper: Wallpaper;
  blur: boolean;
  modelConnections: ModelConnection[];
  defaultModelConnectionId: string | null;
  homeLayout: HomeLayout;
}
export interface PhoneSettingsV6 extends Omit<PhoneSettings, "version" | "appearance"> {
  version: 6;
}
export interface PhoneSettingsV5 extends Omit<
  PhoneSettingsV6,
  "version" | "wechatHistoryMessageLimit"
> {
  version: 5;
}
export interface PhoneSettingsV4 extends Omit<PhoneSettingsV5, "version" | "wechatSendMode"> {
  version: 4;
}
export interface PhoneSettingsV3 extends Omit<PhoneSettingsV4, "version" | "homeLayout"> {
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
  read: () =>
    | PhoneSettings
    | PhoneSettingsV6
    | PhoneSettingsV5
    | PhoneSettingsV4
    | PhoneSettingsV3
    | PhoneSettingsV2
    | LegacyPhoneSettings
    | undefined;
  save: (settings: PhoneSettings) => void;
  listWallpapers: () => Promise<WallpaperImage[]>;
  uploadWallpaper: (image: Blob) => Promise<WallpaperImage>;
  imageUrl: (path: string) => string;
}
