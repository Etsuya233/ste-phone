import type { CharacterProfile } from "../../data-source/public.ts";
import type { WechatConversation } from "../wechat.ts";
import type { WechatStickerLibrary } from "../wechat-sticker-library.ts";
import { findWechatSticker, type WechatStickerPack } from "../wechat-stickers.ts";
import { PersonAvatar } from "./wechat-page.tsx";

export function WechatMessages({
  conversation,
  accountId,
  people,
  packs,
  stickers,
}: {
  conversation: WechatConversation | undefined;
  accountId: string | undefined;
  people: readonly CharacterProfile[];
  packs: readonly WechatStickerPack[];
  stickers: WechatStickerLibrary;
}) {
  return (
    <div className="wechat-messages">
      {conversation?.messages.map((message) => {
        const sender =
          people.find((person) => person.id === message.senderId)?.name ??
          conversation.people.find((person) => person.id === message.senderId)!.name;
        const sticker = findWechatSticker(packs, message.content.text);
        return (
          <div
            key={message.id}
            className={`wechat-message ${message.senderId === accountId ? "wechat-message--mine" : ""}`}
          >
            <PersonAvatar name={sender} />
            {sticker ? (
              <img
                className="wechat-message-sticker"
                src={stickers.imageUrl(sticker.image)}
                alt={message.content.text}
                title={sticker.description}
              />
            ) : (
              <p>{message.content.text}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
