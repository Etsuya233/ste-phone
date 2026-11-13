import type { GalleryImage } from "../../gallery/public.ts";
import { ProfileAvatar } from "../../../frontend/images/profile-avatar.tsx";
import type { WechatPreferences, WechatSendMode } from "../../settings/public.ts";
import type { Navigation } from "../../../frontend/foundation/navigation-stack.tsx";
import type { WechatService } from "../wechat-service.ts";
import type { WechatSnapshot } from "../wechat.ts";
import type { WechatStickerLibrary } from "../wechat-sticker-library.ts";

export type WechatRoute =
  | { page: "home" | "accounts" | "stickers" | "settings" | "intents" }
  | { page: "chat" | "person" | "reply-guidance" | "group-chat" | "group-round"; id: string }
  | { page: "group-details"; id?: string }
  | { page: "chat-image"; id: string; messageId?: string }
  | { page: "chat-payment-compose"; id: string; kind: "redPacket" | "transfer" }
  | { page: "chat-payment"; id: string; messageId: string }
  | { page: "moments" | "moment-ai-author"; scopeId: string }
  | { page: "moment-compose"; scopeId: string; onPublished(): void }
  | { page: "moment-detail"; scopeId: string; id: string }
  | { page: "moment-image"; scopeId: string; id: string; index: number }
  | { page: "moment-image-view"; imagePath: string; description: string }
  | {
      page: "moment-image-picker";
      selectedKey?: string;
      onSelect(image: GalleryImage): Promise<void>;
    }
  | {
      page: "moment-participants";
      scopeId: string;
      id: string;
      onInteracted(count: number): void;
    };
export interface WechatPageProps {
  wechat: WechatService;
  preferences: WechatPreferences;
  sendMode: WechatSendMode;
  state: WechatSnapshot;
  navigation: Navigation<WechatRoute>;
  stickers: WechatStickerLibrary;
  stickerState: ReturnType<WechatStickerLibrary["getSnapshot"]>;
}
export function PersonAvatar({ name, path }: { name: string; path?: string }) {
  return (
    <ProfileAvatar className="wechat-avatar" path={path}>
      {name.slice(0, 1)}
    </ProfileAvatar>
  );
}
