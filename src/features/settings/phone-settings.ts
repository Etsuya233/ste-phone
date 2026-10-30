export type Wallpaper = { kind: "gradient" } | { kind: "image"; url: string; label: string };
export interface PhoneSettings {
  version: 1;
  wallpaper: Wallpaper;
  blur: boolean;
  savedUrls: string[];
}
export interface BackgroundImage {
  url: string;
  label: string;
}
export interface SettingsStorage {
  read: () => PhoneSettings | undefined;
  save: (settings: PhoneSettings) => void;
  backgrounds: () => Promise<BackgroundImage[]>;
}
export const defaultSettings: PhoneSettings = {
  version: 1,
  wallpaper: { kind: "gradient" },
  blur: false,
  savedUrls: [],
};
export class PhoneSettingsService {
  private state: PhoneSettings;
  private listeners = new Set<() => void>();
  private storage: SettingsStorage;
  constructor(storage: SettingsStorage) {
    this.storage = storage;
    this.state = storage.read() ?? defaultSettings;
  }
  getState = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  backgrounds = () => this.storage.backgrounds();
  apply(settings: PhoneSettings) {
    this.storage.save(settings);
    this.state = settings;
    this.listeners.forEach((listener) => listener());
  }
}
export function wallpaperUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("壁纸地址需要使用 HTTP 或 HTTPS");
  return url.href;
}
