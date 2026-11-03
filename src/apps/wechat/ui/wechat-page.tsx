import type { WechatPreferences, WechatSendMode } from "../../settings/public.ts";
import type { Navigation } from "../../../frontend/foundation/navigation-stack.tsx";
import type { WechatService } from "../wechat-service.ts";
import type { WechatSnapshot } from "../wechat.ts";
import type { WechatStickerLibrary } from "../wechat-sticker-library.ts";

export type WechatRoute =
  | { page: "home" | "accounts" | "stickers" | "settings" }
  | { page: "chat" | "person" | "reply-guidance"; id: string }
  | { page: "moments" | "moment-ai-author"; scopeId: string }
  | { page: "moment-compose"; scopeId: string; onPublished(): void }
  | { page: "moment-detail"; scopeId: string; id: string };
export interface WechatPageProps {
  wechat: WechatService;
  preferences: WechatPreferences;
  sendMode: WechatSendMode;
  state: WechatSnapshot;
  navigation: Navigation<WechatRoute>;
  stickers: WechatStickerLibrary;
  stickerState: ReturnType<WechatStickerLibrary["getSnapshot"]>;
}
export function PersonAvatar({ name }: { name: string }) {
  return (
    <span className="wechat-avatar" aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}
