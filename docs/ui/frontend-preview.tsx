import { createMapConversationStorage } from "../../src/infrastructure/host/map-conversation-storage.ts";
import { PhoneSettingsService } from "../../src/apps/settings/settings-service.ts";
import { createPreviewMapStorage } from "./preview-map.ts";
import { createPreviewImageHub } from "./preview-image-hub.ts";
import { createPreviewSettingsStorage } from "./preview-wallpapers.ts";
import { createPreviewAiTransport } from "./preview-ai-transport.ts";
import { createPreviewChatContext } from "./preview-chat-context.ts";
import { createPreviewCharacterOverrideStorage } from "./preview-character-overrides.ts";
import { createPreviewCampusStorage } from "./preview-campus.ts";
import { createPreviewDiaryStorage } from "./preview-diary-storage.ts";
import { createPreviewWechatStorage } from "./preview-wechat-storage.ts";
import { createPreviewWechatStickerStorage } from "./preview-wechat-stickers.ts";
import { createPhone } from "../../src/bootstrap/create-phone.tsx";
import { mountPhone } from "../../src/frontend/host/mount-phone.tsx";
import { createPreviewMemory } from "./data-source-fixture.ts";
import { createIndexedDbLogStorage } from "../../src/infrastructure/browser/log-storage.ts";
import { createPhoneLog } from "../../src/apps/logs/public.ts";
import { defaultSpeechConnection } from "../../src/core/speech/public.ts";
import { previewSpeech } from "./preview-speech.ts";

import { MemoryDatabaseProvider } from "../../src/infrastructure/ste-memory/memory-database-provider.ts";

const options = new URLSearchParams(window.location.search);
const memory = createPreviewMemory(options.get("data-state"));
globalThis.STE_MEMORY_API = memory;
const previewMemoryChatIdentity = memory.getContext().chatIdentity;
const logs = createPhoneLog({
  storage: createIndexedDbLogStorage("ste-phone-logs-v1"),
});
// 预览提供可视化验收数据，与生产日志格式一致，不请求模型。
if (options.get("logs-test") === "demo") {
  logs.info("system", "STE Phone", "预览日志示例", { version: "preview" });
  logs.info("diary", "STE Phone AI", "日记生成 request", {
    requestId: "phone-ai-demo-1",
    operation: "日记生成",
    event: "request",
    model: "preview-model",
    messages: [{ role: "system", characters: 289 }],
  });
  logs.warn("wechat", "STE Phone AI", "微信回复 aborted", {
    requestId: "phone-ai-demo-2",
    operation: "微信回复",
    event: "aborted",
    message: "模型请求已取消",
  });
  logs.error("settings", "STE Phone AI", "连接测试 error", {
    requestId: "phone-ai-demo-3",
    operation: "连接测试",
    event: "error",
    message: "模型请求失败（HTTP 401）",
    responseBody: "private raw response",
    cause: { status: 401, statusText: "Unauthorized" },
  });
}
const settingsStorage = await createPreviewSettingsStorage();
if (options.get("voice-playground") === "1") {
  const settings = new PhoneSettingsService(settingsStorage);
  if (!settings.getState().speechConnection) {
    settings.saveSpeechConnection({
      ...defaultSpeechConnection,
      endpoint: "https://preview.invalid/v1/audio/speech",
    });
  }
}
// 地图入口提供模拟连接，全部请求仍由 preview-ai-transport 截获。
const campusPreview = options.get("twitter") === "1" || options.get("campus-community") === "1";
if (options.get("map") === "1" || campusPreview) {
  const settings = new PhoneSettingsService(settingsStorage);
  if (settings.modelConnections.getSnapshot().connections.length === 0) {
    settings.saveModelConnection({
      id: "preview-model",
      name: "预览模拟",
      model: "preview-model",
      baseUrl: "https://preview.invalid/v1",
      apiKey: "",
      customHeaders: {},
    });
  }
  if (campusPreview && !settings.modelConnections.getSnapshot().defaultModelConnectionId) {
    settings.selectDefaultModelConnection(
      settings.modelConnections.getSnapshot().connections[0]!.id,
    );
  }
}
const phone = createPhone({
  speech: previewSpeech,
  imageHub: createPreviewImageHub(options.get("image-test")),
  settingsStorage,
  aiTransport: createPreviewAiTransport(
    options.get("campus-test") ??
      options.get("map-test") ??
      options.get("moments-test") ??
      options.get("wechat-test") ??
      options.get("diary-test") ??
      options.get("model-test"),
    logs,
  ),
  chat: createPreviewChatContext(),
  dataProvider: new MemoryDatabaseProvider(),
  characterOverrides: createPreviewCharacterOverrideStorage(options.get("character-override-test")),
  matchesMemoryChat: (identity) => identity === previewMemoryChatIdentity,
  mapConversations: createMapConversationStorage(
    localStorage,
    "ste-phone-preview-map-conversation-v1:",
  ),
  mapStorage: createPreviewMapStorage(options.get("map-test")),
  campusStorage: createPreviewCampusStorage(options.get("campus-test")),
  diaryStorage: createPreviewDiaryStorage(options.get("diary-test")),
  wechatStorage: createPreviewWechatStorage(
    options.get("wechat-test"),
    options.get("moments-test"),
  ),
  wechatStickerStorage: await createPreviewWechatStickerStorage(),
  logs,
});
if (campusPreview) {
  // A stored desktop layout can predate the shortcut. Install before mounting so
  // Home and Expose can reopen the same app through the regular launcher.
  const { grid, dock } = phone.homeScreen.getSnapshot();
  if (!grid.includes("campus-community") && !dock.includes("campus-community")) {
    phone.homeScreen.install("campus-community");
  }
}
mountPhone({
  apps: phone.apps,
  wallpaper: phone.wallpaper,
  homeScreen: phone.homeScreen,
  appearance: phone.appearance,
  initialApp: campusPreview
    ? "campus-community"
    : options.get("voice-playground") === "1"
      ? "voice-playground"
      : options.get("map") === "1"
        ? "map"
        : options.get("gallery") === "1"
          ? "gallery"
          : options.get("image-playground") === "1"
            ? "image-playground"
            : options.get("wechat") === "1"
              ? "wechat"
              : options.get("diary") === "1"
                ? "diary"
                : options.get("app-store") === "1"
                  ? "app-store"
                  : options.get("settings") === "1"
                    ? "settings"
                    : options.get("database") === "1"
                      ? "database"
                      : options.get("data-source") === "1"
                        ? "data-source"
                        : options.get("logs") === "1"
                          ? "logs"
                          : options.get("foundation") === "1"
                            ? "foundation"
                            : "home",
  responsive: options.get("responsive") === "1",
  draggable: options.get("draggable") === "1",
});
logs.info("system", "STE Phone", "独立预览已加载");
