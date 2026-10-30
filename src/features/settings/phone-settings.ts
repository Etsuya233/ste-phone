export type Wallpaper = { kind: "gradient" } | { kind: "image"; path: string };
export interface PhoneSettings {
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
  read: () => PhoneSettings | LegacyPhoneSettings | undefined;
  save: (settings: PhoneSettings) => void;
  listWallpapers: () => Promise<WallpaperImage[]>;
  uploadWallpaper: (image: Blob) => Promise<WallpaperImage>;
  imageUrl: (path: string) => string;
}
export const defaultSettings: PhoneSettings = {
  version: 2,
  wallpaper: { kind: "gradient" },
  blur: false,
};
export const wallpaperFormats = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
} as const;
export class PhoneSettingsService {
  private state: PhoneSettings;
  private listeners = new Set<() => void>();
  private storage: SettingsStorage;
  constructor(storage: SettingsStorage) {
    this.storage = storage;
    const stored = storage.read();
    if (!stored) this.state = defaultSettings;
    else if (stored.version === 1) {
      // Version 1 selected host backgrounds and external URLs; neither belongs to the Phone library.
      this.state = { version: 2, wallpaper: { kind: "gradient" }, blur: stored.blur };
      storage.save(this.state);
    } else if (stored.version === 2) this.state = stored;
    else throw new Error("不支持的手机设置版本");
  }
  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  listWallpapers = () => this.storage.listWallpapers();
  async uploadWallpaper(image: Blob): Promise<WallpaperImage> {
    if (!Object.hasOwn(wallpaperFormats, image.type))
      throw new Error("请选择 PNG、JPEG 或 WebP 图片");
    if (image.size === 0 || image.size > 10 * 1024 * 1024)
      throw new Error("图片大小需在 10 MB 以内");
    return this.storage.uploadWallpaper(image);
  }
  imageUrl(wallpaper: Wallpaper): string | undefined {
    return wallpaper.kind === "image" ? this.storage.imageUrl(wallpaper.path) : undefined;
  }
  apply(settings: PhoneSettings) {
    this.storage.save(settings);
    this.state = settings;
    this.listeners.forEach((listener) => listener());
  }
}
