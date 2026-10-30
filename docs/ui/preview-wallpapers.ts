import { PhoneSettingsService } from "../../src/features/settings/phone-settings.ts";
import type {
  SettingsStorage,
  WallpaperImage,
} from "../../src/features/settings/phone-settings.ts";

interface StoredImage {
  id: number;
  blob: Blob;
}
export async function createPreviewSettings(): Promise<PhoneSettingsService> {
  const database = await new Promise<IDBDatabase>((accept, reject) => {
    const request = indexedDB.open("ste-phone-preview-wallpapers", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("images", { keyPath: "id", autoIncrement: true });
    request.onsuccess = () => accept(request.result);
    request.onerror = () => reject(request.error);
  });
  const entries = await new Promise<StoredImage[]>((accept, reject) => {
    const request = database.transaction("images").objectStore("images").getAll();
    request.onsuccess = () => accept(request.result as StoredImage[]);
    request.onerror = () => reject(request.error);
  });
  const images = new Map<string, string>();
  for (const entry of entries)
    images.set(`preview-wallpaper:${entry.id}`, URL.createObjectURL(entry.blob));
  const storage: SettingsStorage = {
    read: () => {
      const value = localStorage.getItem("ste-phone-preview-settings-v1");
      return value ? JSON.parse(value) : undefined;
    },
    save: (value) => localStorage.setItem("ste-phone-preview-settings-v1", JSON.stringify(value)),
    imageUrl: (path) => {
      const url = images.get(path);
      if (!url) throw new Error("预览壁纸不存在");
      return url;
    },
    listWallpapers: async () => [...images].reverse().map(([path, url]) => ({ path, url })),
    uploadWallpaper: async (blob) => {
      const id = await new Promise<IDBValidKey>((accept, reject) => {
        const transaction = database.transaction("images", "readwrite");
        const request = transaction.objectStore("images").add({ blob });
        transaction.oncomplete = () => accept(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      const image: WallpaperImage = {
        path: `preview-wallpaper:${id}`,
        url: URL.createObjectURL(blob),
      };
      images.set(image.path, image.url);
      return image;
    },
  };
  // URLs belong to this mounted preview session, including Home, Expose and dialog closing.
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    for (const url of images.values()) URL.revokeObjectURL(url);
    database.close();
  });
  return new PhoneSettingsService(storage);
}
