/** 单聊内共用的小图标，全部以内联 SVG 绘制，避免依赖系统 Emoji 或外部图片。 */
export function WechatAddIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

export function WechatSmileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="8.5" cy="9" r="1" className="wechat-smile-eye" />
      <circle cx="15.5" cy="9" r="1" className="wechat-smile-eye" />
      <path d="M7.5 13.5a4.7 4.7 0 0 0 9 0" />
    </svg>
  );
}

export function WechatImageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="14" rx="3" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 17 4.5-4.5 3.5 3.5 2.5-2.5L20 18" />
    </svg>
  );
}

export function WechatRedPacketIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" rx="3" />
      <path d="M4 8c2.4 1.8 5 2.7 8 2.7s5.6-.9 8-2.7" />
      <path d="M10.5 13.5h3M12 13.5v3.5" />
    </svg>
  );
}

export function WechatTransferIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M7.5 10h8m-2.5-2.5L15.5 10 13 12.5" />
      <path d="M16.5 14h-8m2.5-2.5L8.5 14 11 16.5" />
    </svg>
  );
}
