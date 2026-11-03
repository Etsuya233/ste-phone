import type { WechatPreferences } from "../../settings/public.ts";
import { useEffect, useSyncExternalStore } from "react";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import type { WechatService } from "../wechat-service.ts";
import type { WechatRoute } from "./wechat-page.tsx";
import { WechatHome } from "./wechat-home.tsx";
import { WechatAccounts, WechatPerson } from "./wechat-people.tsx";
import { WechatChat } from "./wechat-chat.tsx";
import { WechatStickers } from "./wechat-stickers.tsx";
import type { WechatStickerLibrary } from "../wechat-sticker-library.ts";
import { WechatReplyGuidance } from "./wechat-reply-guidance.tsx";

export function WechatApp({
  wechat,
  preferences,
  stickers,
  active,
  onHome,
}: {
  wechat: WechatService;
  preferences: WechatPreferences;
  stickers: WechatStickerLibrary;
  active: boolean;
  onHome(): void;
}) {
  const sendMode = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
  const state = useSyncExternalStore(wechat.subscribe, wechat.getSnapshot);
  const stickerState = useSyncExternalStore(stickers.subscribe, stickers.getSnapshot);
  useEffect(() => {
    void wechat.prepare();
  }, [wechat, state.chatId]);
  return (
    <div className="wechat-app">
      <NavigationStack<WechatRoute>
        key={JSON.stringify([state.chatId, state.data.account?.scopeId, state.data.account?.id])}
        active={active}
        initialRoutes={[{ page: "home" }]}
      >
        {(route, navigation) => {
          const props = {
            wechat,
            state,
            navigation,
            stickers,
            stickerState,
            sendMode,
            preferences,
          };
          switch (route.page) {
            case "home":
              return (
                <WechatHome {...props} onHome={onHome} active={active && navigation.current} />
              );
            case "accounts":
              return <WechatAccounts {...props} />;
            case "stickers":
              return <WechatStickers {...props} />;
            case "person":
              return <WechatPerson {...props} id={route.id} />;
            case "reply-guidance":
              return (
                <WechatReplyGuidance
                  {...props}
                  id={route.id}
                  active={active && navigation.current}
                />
              );
            case "chat":
              return <WechatChat {...props} id={route.id} active={active && navigation.current} />;
          }
        }}
      </NavigationStack>
    </div>
  );
}
