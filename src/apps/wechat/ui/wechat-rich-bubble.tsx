import type { ReactNode } from "react";
import { useGallery } from "../../../frontend/images/gallery-context.ts";
import {
  formatWechatAmount,
  wechatPaymentStatus,
  type WechatMessageContent,
} from "../wechat-message-content.ts";
import { WechatImageIcon, WechatRedPacketIcon, WechatTransferIcon } from "./wechat-chat-icons.tsx";

export function WechatRichBubble({
  content,
  recalled,
  onOpen,
}: {
  content: Exclude<WechatMessageContent, { type: "text" }>;
  recalled?: boolean;
  onOpen(): void;
}) {
  const { imageUrl } = useGallery();
  if (content.type === "image") {
    const body = content.image ? (
      <span className="wechat-rich-media">
        <img src={imageUrl(content.image.imagePath)} alt={content.description} loading="lazy" />
        <span className="wechat-rich-media-hint" aria-hidden="true">
          查看
        </span>
      </span>
    ) : (
      <span className="wechat-rich-placeholder">
        <span className="wechat-rich-placeholder-icon" aria-hidden="true">
          <WechatImageIcon />
        </span>
        <span className="wechat-rich-placeholder-copy">
          <strong>图片</strong>
          <span>{content.description}</span>
        </span>
      </span>
    );
    return (
      <RichBubbleFrame
        className={`wechat-rich-bubble--image${content.image ? "" : " wechat-rich-bubble--placeholder"}`}
        label={`查看图片：${content.description}`}
        recalled={recalled}
        onOpen={onOpen}
      >
        {body}
      </RichBubbleFrame>
    );
  }

  const packet = content.type === "redPacket";
  const note = content.note.trim();
  const title = packet ? note || "恭喜发财，大吉大利" : `¥${formatWechatAmount(content.amountFen)}`;
  const subtitle = `${packet ? "微信红包" : note || "微信转账"} · ${wechatPaymentStatus(content)}`;
  return (
    <RichBubbleFrame
      className={`wechat-rich-bubble--${content.type}`}
      label={`${packet ? "红包" : "转账"}：${title}，${wechatPaymentStatus(content)}，查看详情`}
      recalled={recalled}
      onOpen={onOpen}
    >
      <span className="wechat-pay-emblem" aria-hidden="true">
        {packet ? <WechatRedPacketIcon /> : <WechatTransferIcon />}
      </span>
      <span className="wechat-pay-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </span>
    </RichBubbleFrame>
  );
}

/** 撤回后保留卡片外观，但不再提供详情入口。 */
function RichBubbleFrame({
  className,
  label,
  recalled,
  onOpen,
  children,
}: {
  className: string;
  label: string;
  recalled?: boolean;
  onOpen(): void;
  children: ReactNode;
}) {
  const classes = `wechat-rich-bubble ${className}`;
  return recalled ? (
    <div className={classes}>{children}</div>
  ) : (
    <button type="button" className={classes} aria-label={label} onClick={onOpen}>
      {children}
    </button>
  );
}
