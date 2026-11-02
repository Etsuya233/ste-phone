import { readStEmoteArchive } from "./st-emote-archive.ts";
import { type WechatStickerPack, type WechatStickerStorage } from "./wechat-stickers.ts";

interface StickerSnapshot {
  packs: readonly WechatStickerPack[];
  importing: boolean;
  error: string | null;
}

/** 表情库属于 ST 账号，跨聊天共享；导入任务不依赖发起页面或当前微信帐号。 */
export class WechatStickerLibrary {
  readonly #storage: WechatStickerStorage;
  readonly #listeners = new Set<() => void>();
  #snapshot: StickerSnapshot;

  constructor(storage: WechatStickerStorage) {
    this.#storage = storage;
    this.#snapshot = { packs: storage.read(), importing: false, error: null };
  }
  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  imageUrl = (path: string) => this.#storage.imageUrl(path);

  async importArchive(file: Blob): Promise<void> {
    if (this.#snapshot.importing) {
      throw new Error("正在导入表情包");
    }
    this.#publish({ importing: true, error: null });
    try {
      const { pack, images } = await readStEmoteArchive(file);
      if (
        this.#snapshot.packs.some((item) => item.name.toLowerCase() === pack.name.toLowerCase())
      ) {
        throw new Error(`表情包「${pack.name}」已存在，请在 st-emote 中改名后重新导出`);
      }
      const paths = new Map<string, string>();
      for (const [path, image] of images) {
        paths.set(path, await this.#storage.upload(image.blob, image.format));
      }
      const stickers = pack.stickers.map((sticker) => ({
        label: sticker.label,
        description: sticker.description,
        image: sticker.file ? paths.get(sticker.file)! : (sticker.url ?? ""),
      }));
      const packs = [...this.#snapshot.packs, { name: pack.name, enabled: true, stickers }];
      this.#storage.save(packs);
      this.#publish({ packs });
    } catch (error) {
      this.#publish({ error: (error as Error).message });
    } finally {
      this.#publish({ importing: false });
    }
  }

  setEnabled(name: string, enabled: boolean): void {
    const packs = this.#snapshot.packs.map((pack) =>
      pack.name === name ? { ...pack, enabled } : pack,
    );
    try {
      this.#storage.save(packs);
      this.#publish({ packs, error: null });
    } catch (error) {
      this.#publish({ error: (error as Error).message });
    }
  }

  #publish(patch: Partial<StickerSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
