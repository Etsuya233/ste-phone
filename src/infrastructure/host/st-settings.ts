import type { StChatContext } from "./chat-context.ts";

import type {
  PhoneSettings,
  PhoneSettingsV2,
  LegacyPhoneSettings,
  SettingsStorage,
} from "../../apps/settings/ports/settings-storage.ts";
interface StContext extends StChatContext {
  extensionSettings: { ste_phone?: PhoneSettings | PhoneSettingsV2 | LegacyPhoneSettings };
  saveSettingsDebounced: () => void;
  getRequestHeaders: () => Record<string, string>;
}
declare global {
  interface Window {
    SillyTavern: { getContext: () => StContext };
  }
}
const wallpaperFolder = "ste-phone-wallpapers";
export function createStSettingsStorage(): SettingsStorage {
  const context = window.SillyTavern.getContext();
  return {
    read: () => context.extensionSettings.ste_phone,
    save: (settings) => {
      context.extensionSettings.ste_phone = settings;
      context.saveSettingsDebounced();
    },
    imageUrl: (path) => path,
    listWallpapers: async () => {
      const response = await fetch("/api/images/list", {
        method: "POST",
        headers: context.getRequestHeaders(),
        body: JSON.stringify({ folder: wallpaperFolder, sortField: "date", sortOrder: "desc" }),
      });
      if (!response.ok) throw new Error(`读取失败（${response.status}）`);
      const files = (await response.json()) as string[];
      return files.map((file) => {
        const path = `/user/images/${wallpaperFolder}/${encodeURIComponent(file)}`;
        return { path, url: path };
      });
    },
    uploadWallpaper: async (image) => {
      const bytes = new Uint8Array(await image.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 32768)
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      // getRandomValues is also available in the HTTP LAN preview/browser context.
      const filename = [...crypto.getRandomValues(new Uint8Array(16))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const response = await fetch("/api/images/upload", {
        method: "POST",
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
          image: btoa(binary),
          format: (
            { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as Record<
              string,
              string
            >
          )[image.type],
          ch_name: wallpaperFolder,
          filename,
        }),
      });
      if (!response.ok) throw new Error(`上传失败（${response.status}）`);
      const uploaded = (await response.json()) as { path: string };
      const path = uploaded.path;
      return { path, url: path };
    },
  };
}
