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
import { WechatRichBubble } from "./wechat-rich-bubble.tsx";
import { WechatMentionAvatar } from "./wechat-mention-avatar.tsx";

export function WechatMessages({
  conversation,
  accountId,
  people,
  packs,
  stickers,
  active,
  memory,
  onOpenImage,
  onOpenPayment,
  onMention,
}: {
  conversation: WechatConversation | undefined;
  accountId: string | undefined;
  people: readonly CharacterProfile[];
  packs: readonly WechatStickerPack[];
  stickers: WechatStickerLibrary;
  active: boolean;
  memory: ReturnType<typeof useWechatMemory>;
  onOpenImage(messageId: string): void;
  onOpenPayment(messageId: string): void;
  onMention(name: string): void;
}) {
  const now = useWechatClock(active);
  const profiles = new Map(people.map((person) => [person.id, person]));
  const identities = new Map(conversation?.people.map((person) => [person.id, person]));
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
        const person = profiles.get(message.senderId);
        const sender = person?.name ?? identities.get(message.senderId)!.name;
        const mine = message.senderId === accountId;
        const { content } = message;
        const sticker =
          content.type === "text" ? findWechatSticker(packs, content.text) : undefined;
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
            {content.type === "system" ? (
              <button
                type="button"
                className="wechat-system-message"
                onClick={() => memory.openMessage(message.id)}
              >
                {content.text}
              </button>
            ) : (
              <div
                className={`wechat-message ${mine ? "wechat-message--mine" : ""}${message.recalled ? " wechat-message--recalled" : ""}`}
              >
                {conversation.kind === "group" ? (
                  <WechatMentionAvatar
                    path={person?.avatar?.imagePath}
                    name={sender}
                    active={active}
                    onMention={onMention}
                  />
                ) : (
                  <PersonAvatar path={person?.avatar?.imagePath} name={sender} />
                )}
                <div className="wechat-message-body">
                  {conversation.kind === "group" ? (
                    <small className="wechat-message-sender">{sender}</small>
                  ) : null}
                  <WechatMessageBubble
                    index={index}
                    kind={content.type !== "text" ? "rich" : sticker ? "sticker" : "text"}
                    onMenu={() => memory.openMessage(message.id)}
                  >
                    {content.type !== "text" ? (
                      <WechatRichBubble
                        content={content}
                        recalled={message.recalled}
                        onOpen={() => {
                          if (content.type === "image") {
                            onOpenImage(message.id);
                          } else {
                            onOpenPayment(message.id);
                          }
                        }}
                      />
                    ) : sticker ? (
                      <img
                        className="wechat-message-sticker"
                        src={stickers.imageUrl(sticker.image)}
                        alt={content.text}
                        title={sticker.description}
                      />
                    ) : (
                      <>
                        <p>{content.text}</p>
                        <span className="wechat-message-width" aria-hidden="true">
                          {content.text}
                        </span>
                      </>
                    )}
                  </WechatMessageBubble>
                </div>
              </div>
            )}
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
