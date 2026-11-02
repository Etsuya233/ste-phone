import { useEffect, useSyncExternalStore } from "react";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import type { WechatService } from "../wechat-service.ts";
import type { WechatRoute } from "./wechat-page.tsx";
import { WechatHome } from "./wechat-home.tsx";
import { WechatAccounts, WechatPerson } from "./wechat-people.tsx";
import { WechatChat } from "./wechat-chat.tsx";

export function WechatApp({
  wechat,
  active,
  onHome,
}: {
  wechat: WechatService;
  active: boolean;
  onHome(): void;
}) {
  const state = useSyncExternalStore(wechat.subscribe, wechat.getSnapshot);
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
          const props = { wechat, state, navigation };
          switch (route.page) {
            case "home":
              return <WechatHome {...props} onHome={onHome} />;
            case "accounts":
              return <WechatAccounts {...props} />;
            case "person":
              return <WechatPerson {...props} id={route.id} />;
            case "chat":
              return <WechatChat {...props} id={route.id} active={active && navigation.current} />;
          }
        }}
      </NavigationStack>
    </div>
  );
}
