import { WechatMomentImage, WechatMomentImageView } from "./wechat-moment-image.tsx";
import { WechatMomentImagePicker } from "./wechat-moment-image-picker.tsx";
import type { WechatPreferences } from "../../settings/public.ts";
import { useEffect, useSyncExternalStore } from "react";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import type { WechatService } from "../wechat-service.ts";
import type { WechatRoute } from "./wechat-page.tsx";
import { WechatHome } from "./wechat-home.tsx";
import { WechatAccounts, WechatPerson } from "./wechat-people.tsx";
import {
  WechatGroupChat,
  WechatGroupDetailsPage,
  WechatGroupRound,
} from "./wechat-group-pages.tsx";
import { WechatChat } from "./wechat-chat.tsx";
import { WechatStickers } from "./wechat-stickers.tsx";
import type { WechatStickerLibrary } from "../wechat-sticker-library.ts";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { WechatSettings } from "./wechat-settings.tsx";
import { WechatIntents } from "./wechat-intents.tsx";
import type { WechatIntentService } from "../wechat-intent-service.ts";
import { WechatReplyGuidance } from "./wechat-reply-guidance.tsx";
import { WechatMoments } from "./wechat-moments.tsx";
import { WechatMomentCompose } from "./wechat-moment-compose.tsx";
import { WechatMomentDetail } from "./wechat-moment-detail.tsx";
import { MomentGenerationNotice, WechatMomentAiAuthor } from "./wechat-moment-ai.tsx";
import { WechatMomentParticipants } from "./wechat-moment-participants.tsx";
import { WechatChatImage } from "./wechat-chat-image.tsx";
import { WechatChatPayment, WechatChatPaymentCompose } from "./wechat-chat-payment.tsx";

export function WechatApp({
  wechat,
  intents,
  preferences,
  stickers,
  active,
  onHome,
}: {
  wechat: WechatService;
  intents: WechatIntentService;
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
      <div
        className="wechat-navigation"
        data-moment-task={state.momentGeneration.status !== "idle" || undefined}
        inert={!!state.operationError}
      >
        <NavigationStack<WechatRoute>
          key={JSON.stringify([
            state.chatId,
            state.momentsScopeId,
            state.data.account?.scopeId,
            state.data.account?.id,
          ])}
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
              case "moment-image-picker":
                return (
                  <WechatMomentImagePicker
                    {...props}
                    selectedKey={route.selectedKey}
                    onSelect={route.onSelect}
                    active={active && navigation.current}
                  />
                );
              case "moment-image":
                return (
                  <WechatMomentImage
                    {...props}
                    scopeId={route.scopeId}
                    id={route.id}
                    index={route.index}
                    active={active && navigation.current}
                  />
                );
              case "moment-image-view":
                return (
                  <WechatMomentImageView
                    navigation={navigation}
                    imagePath={route.imagePath}
                    description={route.description}
                  />
                );
              case "moment-participants":
                return (
                  <WechatMomentParticipants
                    {...props}
                    scopeId={route.scopeId}
                    id={route.id}
                    active={active && navigation.current}
                    onInteracted={route.onInteracted}
                  />
                );
              case "moment-ai-author":
                return (
                  <WechatMomentAiAuthor
                    {...props}
                    scopeId={route.scopeId}
                    active={active && navigation.current}
                  />
                );
              case "moments":
                return <WechatMoments {...props} scopeId={route.scopeId} />;
              case "moment-compose":
                return (
                  <WechatMomentCompose
                    {...props}
                    scopeId={route.scopeId}
                    onPublished={route.onPublished}
                    active={active && navigation.current}
                  />
                );
              case "moment-detail":
                return (
                  <WechatMomentDetail
                    {...props}
                    scopeId={route.scopeId}
                    id={route.id}
                    active={active && navigation.current}
                  />
                );
              case "home":
                return (
                  <WechatHome {...props} onHome={onHome} active={active && navigation.current} />
                );
              case "settings":
                return <WechatSettings {...props} />;
              case "intents":
                return (
                  <WechatIntents
                    service={intents}
                    active={active && navigation.current}
                    onBack={navigation.pop}
                  />
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
              case "group-details":
                return (
                  <WechatGroupDetailsPage
                    {...props}
                    id={route.id}
                    active={active && navigation.current}
                  />
                );
              case "group-round":
                return (
                  <WechatGroupRound
                    {...props}
                    id={route.id}
                    active={active && navigation.current}
                  />
                );
              case "group-chat":
                return (
                  <WechatGroupChat {...props} id={route.id} active={active && navigation.current} />
                );
              case "chat":
                return (
                  <WechatChat {...props} id={route.id} active={active && navigation.current} />
                );
              case "chat-image":
                return (
                  <WechatChatImage
                    {...props}
                    id={route.id}
                    messageId={route.messageId}
                    active={active && navigation.current}
                  />
                );
              case "chat-payment-compose":
                return (
                  <WechatChatPaymentCompose
                    {...props}
                    id={route.id}
                    kind={route.kind}
                    active={active && navigation.current}
                  />
                );
              case "chat-payment":
                return <WechatChatPayment {...props} id={route.id} messageId={route.messageId} />;
            }
          }}
        </NavigationStack>
      </div>
      <MomentGenerationNotice wechat={wechat} state={state} />
      {state.operationError ? (
        <Alert
          title="记忆屏障保存失败"
          active={active}
          actions={[{ label: "好", onClick: wechat.dismissOperationError }]}
          onDismiss={wechat.dismissOperationError}
        >
          {state.operationError}
        </Alert>
      ) : null}
    </div>
  );
}
