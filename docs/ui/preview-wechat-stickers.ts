import type { WechatStickerStorage } from "../../src/apps/wechat/wechat-stickers.ts";

/** 本地预览用 IndexedDB 保存图片字节，配置只保存稳定路径，刷新后重建 URL。 */
export async function createPreviewWechatStickerStorage(): Promise<WechatStickerStorage> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("ste-phone-preview-stickers", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("images", { autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const images = new Map<string, string>();
  await new Promise<void>((resolve, reject) => {
    const request = database.transaction("images").objectStore("images").openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      images.set(`preview-sticker:${cursor.key}`, URL.createObjectURL(cursor.value as Blob));
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) {
      images.forEach((url) => URL.revokeObjectURL(url));
      database.close();
    }
  });
  return {
    read() {
      const text = localStorage.getItem("ste-phone-preview-stickers-v1");
      return text ? JSON.parse(text) : [];
    },
    save: (packs) => localStorage.setItem("ste-phone-preview-stickers-v1", JSON.stringify(packs)),
    imageUrl: (path) => {
      if (/^https?:\/\//iu.test(path)) {
        return path;
      }
      const url = images.get(path);
      if (!url) {
        throw new Error(`预览表情图片不存在：${path}`);
      }
      return url;
    },
    async upload(blob) {
      const id = await new Promise<IDBValidKey>((resolve, reject) => {
        const transaction = database.transaction("images", "readwrite");
        const request = transaction.objectStore("images").add(blob);
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      const path = `preview-sticker:${id}`;
      images.set(path, URL.createObjectURL(blob));
      return path;
    },
  };
}
