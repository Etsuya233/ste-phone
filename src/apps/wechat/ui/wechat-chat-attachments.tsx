import { WechatImageIcon, WechatRedPacketIcon, WechatTransferIcon } from "./wechat-chat-icons.tsx";

/** 与微信附件面板一致的入口，图标使用纯装饰，按钮文字承担可访问名称。 */
export function WechatChatAttachments({
  disabled,
  onImage,
  payments,
}: {
  disabled: boolean;
  onImage(): void;
  payments?: { onRedPacket(): void; onTransfer(): void };
}) {
  return (
    <section className="wechat-attachment-panel" aria-label="添加附件">
      <button type="button" disabled={disabled} onClick={onImage}>
        <span className="wechat-attachment-icon wechat-attachment-icon--image" aria-hidden="true">
          <WechatImageIcon />
        </span>
        <span>图片</span>
      </button>
      {payments ? (
        <>
          <button type="button" disabled={disabled} onClick={payments.onRedPacket}>
            <span
              className="wechat-attachment-icon wechat-attachment-icon--redPacket"
              aria-hidden="true"
            >
              <WechatRedPacketIcon />
            </span>
            <span>红包</span>
          </button>
          <button type="button" disabled={disabled} onClick={payments.onTransfer}>
            <span
              className="wechat-attachment-icon wechat-attachment-icon--transfer"
              aria-hidden="true"
            >
              <WechatTransferIcon />
            </span>
            <span>转账</span>
          </button>
        </>
      ) : null}
    </section>
  );
}
