import type { Navigation } from "../../../frontend/foundation/navigation-stack.tsx";
import type { WechatService } from "../wechat-service.ts";
import type { WechatSnapshot } from "../wechat.ts";

export type WechatRoute =
  { page: "home" } | { page: "accounts" } | { page: "chat" | "person"; id: string };
export interface WechatPageProps {
  wechat: WechatService;
  state: WechatSnapshot;
  navigation: Navigation<WechatRoute>;
}
export function PersonAvatar({ name }: { name: string }) {
  return (
    <span className="wechat-avatar" aria-hidden="true">
      {name.slice(0, 1)}
    </span>
  );
}
