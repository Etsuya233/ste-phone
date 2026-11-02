import { stickerKey } from "./wechat-stickers.ts";

interface ArchiveSticker {
  label: string;
  description: string;
  file?: string;
  url?: string;
}
interface PackManifest {
  name: string;
  stickers: ArchiveSticker[];
}

function validateName(value: unknown, pack: boolean): asserts value is string {
  if (
    typeof value !== "string" ||
    [...value].length > 32 ||
    /[[\]<>\r\n\u2028\u2029]/u.test(value) ||
    (pack && (!value.trim() || value.includes(":")))
  ) {
    throw new Error(pack ? "表情包名不符合 st-emote 格式" : "表情标签不符合 st-emote 格式");
  }
}

/** 只转换交换格式中的资源信息，微信独立消息不采用 placement 和尺寸配置。 */
export function parseStEmoteManifest(text: string): PackManifest {
  const raw = JSON.parse(text);
  if (!raw || raw.format !== "st-emote-pack" || raw.version !== 1) {
    throw new Error("仅支持 st-emote v1 表情包 ZIP");
  }
  validateName(raw.name, true);
  if (!Array.isArray(raw.stickers)) {
    throw new Error("表情包缺少 stickers 数组");
  }
  const labels = new Set<string>();
  const stickers = raw.stickers.map((entry: ArchiveSticker) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("表情条目格式错误");
    }
    validateName(entry.label, false);
    if (
      typeof entry.description !== "string" ||
      [...entry.description].length > 1000 ||
      /[\r\n\u2028\u2029]/u.test(entry.description)
    ) {
      throw new Error(`表情「${entry.label}」描述不符合 st-emote 格式`);
    }
    const key = stickerKey(entry.label);
    if (key && labels.has(key)) {
      throw new Error(`重复的表情标签：${entry.label}`);
    }
    labels.add(key);
    validateImageSource(entry);
    return { label: entry.label, description: entry.description, file: entry.file, url: entry.url };
  });
  return { name: raw.name.trim(), stickers };
}

function validateImageSource(entry: ArchiveSticker): void {
  if (entry.file != null && entry.url != null) {
    throw new Error(`表情「${entry.label}」同时指定文件和外链`);
  }
  if (
    entry.file != null &&
    (typeof entry.file !== "string" ||
      /[\\:]/u.test(entry.file) ||
      entry.file.split("/").some((part) => !part || part === "." || part === ".."))
  ) {
    throw new Error(`表情「${entry.label}」的图片路径无效`);
  }
  if (entry.url != null && (typeof entry.url !== "string" || !/^https?:\/\//iu.test(entry.url))) {
    throw new Error(`表情「${entry.label}」的图片外链无效`);
  }
  if (entry.url != null) {
    const url = new URL(entry.url);
    if (!url.hostname) {
      throw new Error(`表情「${entry.label}」的图片外链无效`);
    }
  }
}

/** 上传前读完并校验整包；GIF 字节原样保存，不经过画布转换。 */
export async function readStEmoteArchive(file: Blob) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifest = zip.file("st-emote.json");
  if (!manifest) {
    throw new Error("ZIP 中缺少 st-emote.json");
  }
  const pack = parseStEmoteManifest(await manifest.async("string"));
  const images = new Map<string, { blob: Blob; format: string }>();
  for (const sticker of pack.stickers) {
    if (!sticker.file || images.has(sticker.file)) {
      continue;
    }
    const format = /\.(png|jpe?g|webp|gif)$/iu.exec(sticker.file)?.[1]?.toLowerCase();
    if (!format) {
      throw new Error(`不支持的图片格式：${sticker.file}`);
    }
    const image = zip.file(sticker.file);
    if (!image) {
      throw new Error(`ZIP 中缺少图片：${sticker.file}`);
    }
    const bytes = await image.async("uint8array");
    if (bytes.length > 5 * 1024 * 1024) {
      throw new Error(`图片超过 5 MB：${sticker.file}`);
    }
    images.set(sticker.file, {
      blob: new Blob([new Uint8Array(bytes)], {
        type: `image/${format === "jpg" ? "jpeg" : format}`,
      }),
      format: format === "jpeg" ? "jpg" : format,
    });
  }
  return { pack, images };
}
