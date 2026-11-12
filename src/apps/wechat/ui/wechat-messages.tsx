import type { CharacterProfile } from "../../data-source/public.ts";
import type { WechatConversation } from "../wechat.ts";
import type { WechatStickerLibrary } from "../wechat-sticker-library.ts";
import { findWechatSticker, type WechatStickerPack } from "../wechat-stickers.ts";
import { PersonAvatar } from "./wechat-page.tsx";
import { Fragment } from "react";
import { formatWechatTime, needsWechatTimeSeparator } from "../wechat-time.ts";
import { WechatMemoryBarrier } from "./wechat-memory-barrier.tsx";
import { WechatMessageBubble } from "./wechat-message-bubble.tsx";
import type { useWechatMemory } from "./use-wechat-memory.tsx";
import { useWechatClock } from "./use-wechat-clock.ts";

export function WechatMessages({
  conversation,
  accountId,
  people,
  packs,
  stickers,
  active,
  memory,
}: {
  conversation: WechatConversation | undefined;
  accountId: string | undefined;
  people: readonly CharacterProfile[];
  packs: readonly WechatStickerPack[];
  stickers: WechatStickerLibrary;
  active: boolean;
  memory: ReturnType<typeof useWechatMemory>;
}) {
  const now = useWechatClock(active);
  return (
    <div className="wechat-messages">
      {memory.boundaries
        .filter((item) => item.position === 0)
        .map(({ barrier, position }) => (
          <WechatMemoryBarrier
            key={barrier.id}
            barrier={barrier}
            effective={barrier.id === memory.effectiveId}
            position={position}
            onMenu={() => memory.openBarrier(barrier.id, position)}
          />
        ))}
      {conversation?.messages.map((message, index) => {
        const person = people.find((person) => person.id === message.senderId);
        const sender =
          person?.name ??
          conversation.people.find((person) => person.id === message.senderId)!.name;
        const mine = message.senderId === accountId;
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
            {message.recalled && (
              <p className="wechat-message-recall">{mine ? "你" : sender}撤回了一条消息</p>
            )}
            <div
              className={`wechat-message ${mine ? "wechat-message--mine" : ""}${message.recalled ? " wechat-message--recalled" : ""}`}
            >
              <PersonAvatar path={person?.avatar?.imagePath} name={sender} />
              <WechatMessageBubble index={index} onMenu={() => memory.openMessage(message.id)}>
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
              </WechatMessageBubble>
            </div>
            {memory.boundaries
              .filter((item) => item.position === index + 1)
              .map(({ barrier, position }) => (
                <WechatMemoryBarrier
                  key={barrier.id}
                  barrier={barrier}
                  effective={barrier.id === memory.effectiveId}
                  position={position}
                  onMenu={() => memory.openBarrier(barrier.id, position)}
                />
              ))}
          </Fragment>
        );
      })}
    </div>
  );
}
