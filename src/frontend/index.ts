import { createMapConversationStorage } from "../infrastructure/host/map-conversation-storage.ts";
import { createStMapStorage } from "../infrastructure/host/map-storage.ts";
import { createStPhotoStorage } from "../infrastructure/host/gallery-storage.ts";
import { createStImageHub } from "../infrastructure/host/image-hub.ts";
import { createStSettingsStorage } from "../infrastructure/host/st-settings.ts";
import { createBrowserSpeech } from "../infrastructure/browser/speech.ts";
import { createStAiTransport } from "../infrastructure/host/ai-transport.ts";
import { createPhone } from "../bootstrap/create-phone.tsx";
import { createStChatContext } from "../infrastructure/host/chat-context.ts";
import { mountPhone } from "./host/mount-phone.tsx";
import { MemoryDatabaseProvider } from "../infrastructure/ste-memory/memory-database-provider.ts";
import { createStCampusStorage } from "../infrastructure/host/campus-storage.ts";
import { createStDiaryStorage } from "../infrastructure/host/diary-storage.ts";
import { createStWechatStorage } from "../infrastructure/host/wechat-storage.ts";
import { createStPhoneContextStorage } from "../infrastructure/host/phone-context-storage.ts";
import { createStWechatIntentStorage } from "../infrastructure/host/wechat-intent-storage.ts";
import { registerPhoneContextMacro } from "../infrastructure/host/phone-context-macro.ts";
import { createStChatMetadataStorage } from "../infrastructure/host/chat-metadata-storage.ts";
import { createStCharacterOverrideStorage } from "../infrastructure/host/character-override-storage.ts";
import { createStWechatStickerStorage } from "../infrastructure/host/wechat-stickers.ts";
import { createIndexedDbLogStorage } from "../infrastructure/browser/log-storage.ts";
import { createPhoneLog } from "../apps/logs/public.ts";
import type { PhoneLogApp } from "../apps/logs/public.ts";

declare const __STE_PHONE_VERSION__: string;
declare const toastr: {
  error(
    message: string,
    title: string,
    options: { escapeHtml: boolean; preventDuplicates: boolean },
  ): void;
};

// ST 在加载扩展前创建魔法棒菜单；生产入口需要宿主提供这两个节点。
const menu = document.getElementById("extensionsMenu");
const button = document.getElementById("extensionsMenuButton");
if (!menu || !button) {
  throw new Error("ST 魔法棒菜单尚未就绪，无法挂载小手机入口");
}

// 入口负责组装具体来源。数据源随插件挂载，手机窗口和各 App 只消费这个共享实例。
// 宿主上下文与 App 的具体实现只在入口组装。
const chat = createStChatContext(() => window.SillyTavern.getContext());
const chatMetadata = createStChatMetadataStorage(() => window.SillyTavern.getContext(), chat);
const logs = createPhoneLog({
  storage: createIndexedDbLogStorage("ste-phone-logs-v1"),
});
const phone = createPhone({
  speech: createBrowserSpeech(),
  photoStorage: createStPhotoStorage(),
  imageHub: createStImageHub(),
  dataProvider: new MemoryDatabaseProvider(),
  characterOverrides: createStCharacterOverrideStorage(chatMetadata),
  matchesMemoryChat: chat.matchesMemoryChat,
  settingsStorage: createStSettingsStorage(),
  aiTransport: createStAiTransport(() => window.SillyTavern.getContext().getRequestHeaders(), {
    log: (entry) => {
      const level = entry.event === "error" ? "error" : entry.event === "aborted" ? "warn" : "info";
      const app = typeof entry.app === "string" ? (entry.app as PhoneLogApp) : "system";
      logs[level](app, "STE Phone AI", `${String(entry.operation)} ${String(entry.event)}`, entry);
    },
  }),
  chat,
  mapConversations: createMapConversationStorage(localStorage, "ste-phone-map-conversation-v1:"),
  mapStorage: createStMapStorage(chatMetadata),
  campusStorage: createStCampusStorage(chatMetadata),
  diaryStorage: createStDiaryStorage(chatMetadata),
  wechatStorage: createStWechatStorage(chatMetadata),
  phoneContextStorage: createStPhoneContextStorage(chatMetadata),
  wechatIntentStorage: createStWechatIntentStorage(chatMetadata),
  wechatStickerStorage: createStWechatStickerStorage(() => window.SillyTavern.getContext()),
  logs,
});
registerPhoneContextMacro(
  () => window.SillyTavern.getContext(),
  (id) => phone.phoneContext.expand(id),
  (message) => {
    logs.error("system", "ST 接入", message);
    toastr.error(message, "ST 接入", { escapeHtml: true, preventDuplicates: true });
  },
);
mountPhone({
  apps: phone.apps,
  wallpaper: phone.wallpaper,
  homeScreen: phone.homeScreen,
  appearance: phone.appearance,
  menuEntry: { menu, button },
});
logs.info("system", "STE Phone", `v${__STE_PHONE_VERSION__} 已加载`);
