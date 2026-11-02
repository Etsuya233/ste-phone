import { useState } from "react";
import type { WechatStickerLibrary } from "../wechat-sticker-library.ts";
import type { WechatStickerPack } from "../wechat-stickers.ts";

export function WechatStickerPanel({
  packs,
  stickers,
  disabled,
  onSend,
  onManage,
}: {
  packs: readonly WechatStickerPack[];
  stickers: WechatStickerLibrary;
  disabled: boolean;
  onSend(marker: string): void;
  onManage(): void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const enabled = packs.filter((pack) => pack.enabled);
  const current = enabled.find((pack) => pack.name === selected) ?? enabled[0];
  return (
    <section className="wechat-sticker-panel" aria-label="表情面板">
      <div className="wechat-sticker-grid">
        {current ? (
          current.stickers
            .filter((sticker) => sticker.image && sticker.label.trim())
            .map((sticker) => (
              <button
                type="button"
                className="wechat-sticker-tile"
                aria-label={sticker.label}
                key={sticker.label}
                disabled={disabled}
                title={sticker.description}
                onClick={() => onSend(`[[sticker:${current.name}:${sticker.label}]]`)}
              >
                <img src={stickers.imageUrl(sticker.image)} alt={sticker.label} loading="lazy" />
                <small>{sticker.label}</small>
              </button>
            ))
        ) : (
          <p className="wechat-notice">还没有开启的表情包。</p>
        )}
      </div>
      <nav className="wechat-sticker-packs" aria-label="选择表情包">
        {enabled.map((pack) => (
          <button
            type="button"
            key={pack.name}
            aria-pressed={pack.name === current?.name}
            onClick={() => setSelected(pack.name)}
          >
            {pack.name}
          </button>
        ))}
        <button type="button" onClick={onManage}>
          管理
        </button>
      </nav>
    </section>
  );
}
