import type { PhotoIndexEntry, PhotoStorage } from "../../src/apps/gallery/photo-storage.ts";
import { readPhotoIndex } from "../../src/apps/gallery/photo-storage.ts";

interface StoredPhoto {
  readonly id: string;
  readonly blob: Blob;
  readonly index?: PhotoIndexEntry;
}

const previewPrefix = "preview-photo:";

function commitPhoto(database: IDBDatabase, photo: StoredPhoto): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("photos", "readwrite");
    transaction.objectStore("photos").put(photo);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function createPreviewPhotoStorage(mode: string | null): Promise<PhotoStorage> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("ste-phone-preview-photos", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("photos", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const stored = await new Promise<StoredPhoto[]>((resolve, reject) => {
    const request = database.transaction("photos").objectStore("photos").getAll();
    request.onsuccess = () => resolve(request.result as StoredPhoto[]);
    request.onerror = () => reject(request.error);
  });
  const photos = new Map(stored.map((photo) => [photo.id, photo]));
  const urls = new Map<string, string>();
  for (const photo of stored) {
    if (photo.index) {
      urls.set(photo.index.imagePath, URL.createObjectURL(photo.blob));
    }
  }

  window.addEventListener("pagehide", (event) => {
    if (event.persisted) {
      return;
    }
    for (const url of urls.values()) {
      URL.revokeObjectURL(url);
    }
    database.close();
  });

  let reads = 0;
  let failIndex = mode === "index-error";
  return {
    list: async () => {
      if (mode === "refresh-error" && ++reads === 2) {
        throw new Error("模拟图库刷新失败");
      }
      return [...photos.values()].flatMap(({ index, id }) =>
        index ? [readPhotoIndex(index, id, `${previewPrefix}${id}`)] : [],
      );
    },
    imageUrl: (path) => {
      if (!path.startsWith(previewPrefix)) {
        return path;
      }
      const url = urls.get(path);
      if (!url) {
        throw new Error("预览照片不存在");
      }
      return url;
    },
    uploadFile: async (file, id, _format, signal) => {
      signal.throwIfAborted();
      const photo = { id, blob: file };
      await commitPhoto(database, photo);
      photos.set(id, photo);
      return `${previewPrefix}${id}`;
    },
    saveIndex: async (index) => {
      if (mode === "slow") {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      if (failIndex) {
        failIndex = false;
        throw new Error("模拟照片信息保存失败");
      }
      const photo = photos.get(index.id);
      if (!photo) {
        throw new Error("预览照片文件不存在");
      }
      const indexed = { ...photo, index };
      await commitPhoto(database, indexed);
      photos.set(index.id, indexed);
      urls.set(index.imagePath, URL.createObjectURL(photo.blob));
    },
  };
}
