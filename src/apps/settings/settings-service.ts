import type {
  WallpaperReader,
  WallpaperSnapshot,
  ModelConnectionsReader,
  ModelConnectionsSnapshot,
} from "./public.ts";
import { validateModelConnection } from "./model-connections.ts";
import type { ModelConnection } from "./model-connections.ts";

import type {
  PhoneSettings,
  SettingsStorage,
  Wallpaper,
  WallpaperImage,
} from "./ports/settings-storage.ts";
export type {
  PhoneSettings,
  PhoneSettingsV2,
  LegacyPhoneSettings,
  SettingsStorage,
  Wallpaper,
  WallpaperImage,
} from "./ports/settings-storage.ts";
export const defaultSettings: PhoneSettings = {
  version: 3,
  wallpaper: { kind: "gradient" },
  blur: false,
  modelConnections: [],
  defaultModelConnectionId: null,
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
  private wallpaperSnapshot!: WallpaperSnapshot;
  private connectionsSnapshot!: ModelConnectionsSnapshot;
  readonly wallpaper: WallpaperReader = {
    getSnapshot: () => this.wallpaperSnapshot,
    subscribe: (listener) => this.subscribe(listener),
  };
  readonly modelConnections: ModelConnectionsReader = {
    getSnapshot: () => this.connectionsSnapshot,
    subscribe: (listener) => this.subscribe(listener),
    getConnection: (id) => {
      const connection = this.state.modelConnections.find((item) => item.id === id);
      if (!connection) throw new Error("模型连接不存在");
      return { ...connection, customHeaders: { ...connection.customHeaders } };
    },
  };
  constructor(storage: SettingsStorage) {
    this.storage = storage;
    const stored = storage.read();
    if (!stored) this.state = defaultSettings;
    else if (stored.version === 1) {
      // Version 1 selected host backgrounds and external URLs; neither belongs to the Phone library.
      this.state = { ...defaultSettings, wallpaper: { kind: "gradient" }, blur: stored.blur };
      storage.save(this.state);
    } else if (stored.version === 2) {
      this.state = { ...defaultSettings, wallpaper: stored.wallpaper, blur: stored.blur };
      storage.save(this.state);
    } else if (stored.version === 3) this.state = stored;
    else throw new Error("不支持的手机设置版本");
    this.updateSnapshots();
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
  setWallpaper(wallpaper: Wallpaper, blur: boolean) {
    this.save({ ...this.state, wallpaper, blur });
  }
  saveModelConnection(connection: ModelConnection) {
    const validated = validateModelConnection(connection);
    const exists = this.state.modelConnections.some((item) => item.id === validated.id);
    this.save({
      ...this.state,
      modelConnections: exists
        ? this.state.modelConnections.map((item) => (item.id === validated.id ? validated : item))
        : [...this.state.modelConnections, validated],
      defaultModelConnectionId:
        this.state.modelConnections.length === 0
          ? validated.id
          : this.state.defaultModelConnectionId,
    });
  }
  deleteModelConnection(id: string) {
    if (!this.state.modelConnections.some((connection) => connection.id === id))
      throw new Error("模型连接不存在");
    this.save({
      ...this.state,
      modelConnections: this.state.modelConnections.filter((connection) => connection.id !== id),
      defaultModelConnectionId:
        this.state.defaultModelConnectionId === id ? null : this.state.defaultModelConnectionId,
    });
  }
  selectDefaultModelConnection(id: string | null) {
    if (id !== null && !this.state.modelConnections.some((connection) => connection.id === id))
      throw new Error("模型连接不存在");
    this.save({ ...this.state, defaultModelConnectionId: id });
  }
  defaultModelConnection(): ModelConnection {
    if (this.state.defaultModelConnectionId === null) throw new Error("请先选择默认模型连接");
    const connection = this.state.modelConnections.find(
      (item) => item.id === this.state.defaultModelConnectionId,
    );
    if (!connection) throw new Error("默认模型连接不存在");
    return validateModelConnection(connection);
  }
  private updateSnapshots() {
    this.wallpaperSnapshot = Object.freeze({
      wallpaper: Object.freeze({ ...this.state.wallpaper }),
      blur: this.state.blur,
      url: this.imageUrl(this.state.wallpaper),
    });
    this.connectionsSnapshot = Object.freeze({
      connections: Object.freeze(
        this.state.modelConnections.map(({ id, name, model }) =>
          Object.freeze({ id, name, model }),
        ),
      ),
      defaultModelConnectionId: this.state.defaultModelConnectionId,
    });
  }
  private save(settings: PhoneSettings) {
    this.storage.save(settings);
    this.state = settings;
    this.updateSnapshots();
    this.listeners.forEach((listener) => listener());
  }
}
