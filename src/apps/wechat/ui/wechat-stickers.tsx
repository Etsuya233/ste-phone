import { useRef } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { Switch } from "../../../frontend/foundation/switch.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";

export function WechatStickers({ stickers, stickerState, navigation }: WechatPageProps) {
  const input = useRef<HTMLInputElement>(null);
  const { packs, importing, error } = stickerState;
  return (
    <Page
      navBar={
        <NavBar
          title="表情包"
          back={{ label: "返回", onClick: navigation.pop }}
          right={
            <Button
              aria-label="导入表情包"
              disabled={importing}
              onClick={() => input.current!.click()}
            >
              {importing ? "导入中…" : "＋"}
            </Button>
          }
        />
      }
    >
      <input
        ref={input}
        className="wechat-sticker-file"
        type="file"
        accept=".zip,application/zip"
        aria-label="导入 st-emote ZIP"
        disabled={importing}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            void stickers.importArchive(file);
          }
        }}
      />
      <p className="wechat-notice">
        导入 st-emote 导出的 ZIP。关闭表情包后，聊天中的表情显示原始标记；用户和 AI
        共用已开启的表情包。
      </p>
      {error && (
        <p className="wechat-notice" role="alert">
          {error}
        </p>
      )}
      {importing && (
        <p className="wechat-notice" role="status">
          正在导入表情包…
        </p>
      )}
      {!packs.length && <p className="wechat-notice">还没有表情包，点击右上角 ＋ 导入。</p>}
      {packs.map((pack) => (
        <GroupedList key={pack.name}>
          <div className="wechat-pack-heading">
            <Switch
              label={`${pack.name}（${pack.stickers.length}）`}
              checked={pack.enabled}
              onCheckedChange={(enabled) => stickers.setEnabled(pack.name, enabled)}
            />
          </div>
          <div className="wechat-sticker-grid wechat-sticker-grid--preview">
            {pack.stickers.map((sticker, index) => (
              <div className="wechat-sticker-tile" key={index} title={sticker.description}>
                {sticker.image ? (
                  <img
                    src={stickers.imageUrl(sticker.image)}
                    alt={sticker.label || "未命名表情"}
                    loading="lazy"
                  />
                ) : (
                  <span>缺少图片</span>
                )}
                <small>{sticker.label || "未命名"}</small>
              </div>
            ))}
          </div>
        </GroupedList>
      ))}
    </Page>
  );
}
