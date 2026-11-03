import type { CharacterProfile } from "../../data-source/public.ts";
import type { WechatConversation } from "../wechat.ts";
import type { WechatStickerLibrary } from "../wechat-sticker-library.ts";
import { findWechatSticker, type WechatStickerPack } from "../wechat-stickers.ts";
import { PersonAvatar } from "./wechat-page.tsx";
import { Fragment } from "react";
import { formatWechatTime, needsWechatTimeSeparator } from "../wechat-time.ts";
import { useWechatClock } from "./use-wechat-clock.ts";

export function WechatMessages({
  conversation,
  accountId,
  people,
  packs,
  stickers,
  active,
}: {
  conversation: WechatConversation | undefined;
  accountId: string | undefined;
  people: readonly CharacterProfile[];
  packs: readonly WechatStickerPack[];
  stickers: WechatStickerLibrary;
  active: boolean;
}) {
  const now = useWechatClock(active);
  return (
    <div className="wechat-messages">
      {conversation?.messages.map((message, index) => {
        const sender =
          people.find((person) => person.id === message.senderId)?.name ??
          conversation.people.find((person) => person.id === message.senderId)!.name;
        const sticker = findWechatSticker(packs, message.content.text);
        return (
          <Fragment key={message.id}>
            {needsWechatTimeSeparator(
              message.createdAt,
              conversation.messages[index - 1]?.createdAt,
            ) && (
              <time
                className="wechat-message-time"
                dateTime={message.createdAt}
                title={new Date(message.createdAt).toLocaleString("zh-CN")}
              >
                {formatWechatTime(message.createdAt, now)}
              </time>
            )}
            <div
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
          </Fragment>
        );
      })}
    </div>
  );
}
