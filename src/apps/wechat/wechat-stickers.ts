export interface WechatSticker {
  readonly label: string;
  readonly description: string;
  readonly image: string;
}

export interface WechatStickerPack {
  readonly name: string;
  readonly enabled: boolean;
  readonly stickers: readonly WechatSticker[];
}

export interface WechatStickerStorage {
  read(): readonly WechatStickerPack[];
  save(packs: readonly WechatStickerPack[]): void;
  upload(image: Blob, format: string): Promise<string>;
  imageUrl(path: string): string;
}

export const stickerKey = (value: string) => value.trim().replace(/\s+/gu, " ").toLowerCase();

/** 标记就是消息原文；开关仅改变展示和本轮模型可选清单，不改写聊天记录。 */
export function findWechatSticker(packs: readonly WechatStickerPack[], text: string) {
  const match = /^\[\[sticker:([^:]+):(.+)\]\]$/u.exec(text);
  if (!match) {
    return undefined;
  }
  const pack = packs.find(
    (pack) => pack.enabled && pack.name.toLowerCase() === match[1]!.trim().toLowerCase(),
  );
  return pack?.stickers.find(
    (sticker) =>
      sticker.image && sticker.label.trim() && stickerKey(sticker.label) === stickerKey(match[2]!),
  );
}

export function wechatStickerCatalog(packs: readonly WechatStickerPack[]) {
  return packs
    .filter((pack) => pack.enabled)
    .flatMap((pack) =>
      pack.stickers
        .filter((sticker) => sticker.image && sticker.label.trim())
        .map((sticker) => ({
          marker: `[[sticker:${pack.name}:${sticker.label}]]`,
          description: sticker.description,
        })),
    );
}
