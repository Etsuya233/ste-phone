import type { WechatStickerPack, WechatStickerStorage } from "../../apps/wechat/wechat-stickers.ts";

interface StStickerContext {
  extensionSettings: {
    ste_phone_wechat_stickers?: { version: number; packs: readonly WechatStickerPack[] };
  };
  saveSettingsDebounced(): void;
  getRequestHeaders(): Record<string, string>;
}

/** Phone 持有自己的图片副本，开关与资源均不修改 st-emote 的设置。 */
export function createStWechatStickerStorage(
  getContext: () => StStickerContext,
  request: typeof fetch = fetch,
): WechatStickerStorage {
  const context = getContext();
  return {
    read() {
      const stored = context.extensionSettings.ste_phone_wechat_stickers;
      if (!stored) {
        return [];
      }
      if (stored.version !== 1) {
        throw new Error("微信表情库版本不受支持");
      }
      return structuredClone(stored.packs);
    },
    save(packs) {
      context.extensionSettings.ste_phone_wechat_stickers = {
        version: 1,
        packs: structuredClone(packs),
      };
      context.saveSettingsDebounced();
    },
    imageUrl: (path) => path,
    async upload(image, format) {
      const bytes = new Uint8Array(await image.arrayBuffer());
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 32768) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
      }
      const filename = [...crypto.getRandomValues(new Uint8Array(16))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      const response = await request("/api/images/upload", {
        method: "POST",
        headers: context.getRequestHeaders(),
        body: JSON.stringify({
          image: btoa(binary),
          format,
          ch_name: "ste-phone-stickers",
          filename,
        }),
      });
      if (!response.ok) {
        throw new Error(`表情图片上传失败（${response.status}）`);
      }
      const uploaded = (await response.json()) as { path: string };
      return uploaded.path;
    },
  };
}
