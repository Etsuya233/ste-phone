import { PhoneSettingsService } from "../../src/apps/settings/settings-service.ts";
import { createPreviewMapStorage } from "./preview-map.ts";
import { createPreviewImageHub } from "./preview-image-hub.ts";
import { createPreviewSettingsStorage } from "./preview-wallpapers.ts";
import { createPreviewAiTransport } from "./preview-ai-transport.ts";
import { createPreviewChatContext } from "./preview-chat-context.ts";
import { createPreviewDiaryStorage } from "./preview-diary-storage.ts";
import { createPreviewWechatStorage } from "./preview-wechat-storage.ts";
import { createPreviewWechatStickerStorage } from "./preview-wechat-stickers.ts";
import { createPhone } from "../../src/bootstrap/create-phone.tsx";
import { mountPhone } from "../../src/frontend/host/mount-phone.tsx";
import { createPreviewMemory } from "./data-source-fixture.ts";
import { createLocalStorageLogStorage } from "../../src/infrastructure/browser/log-storage.ts";
import { createPhoneLog } from "../../src/apps/logs/public.ts";

import { MemoryDatabaseProvider } from "../../src/infrastructure/ste-memory/memory-database-provider.ts";

const options = new URLSearchParams(window.location.search);
globalThis.STE_MEMORY_API = createPreviewMemory(options.get("data-state"));
const logs = createPhoneLog({
  storage: createLocalStorageLogStorage("ste-phone-logs-v1"),
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
// 地图入口提供模拟连接，全部请求仍由 preview-ai-transport 截获。
if (options.get("map") === "1") {
  const settings = new PhoneSettingsService(settingsStorage);
  if (!settings.modelConnections.getSnapshot().defaultModelConnectionId) {
    settings.saveModelConnection({
      id: "preview-map",
      name: "地图模拟",
      model: "preview-map",
      baseUrl: "https://preview.invalid/v1",
      apiKey: "",
      customHeaders: {},
    });
    settings.selectDefaultModelConnection("preview-map");
  }
}
const phone = createPhone({
  imageHub: createPreviewImageHub(options.get("image-test")),
  settingsStorage,
  aiTransport: createPreviewAiTransport(
    options.get("map-test") ??
      options.get("moments-test") ??
      options.get("wechat-test") ??
      options.get("diary-test") ??
      options.get("model-test"),
    logs,
  ),
  chat: createPreviewChatContext(),
  dataProvider: new MemoryDatabaseProvider(),
  mapStorage: createPreviewMapStorage(options.get("map-test")),
  diaryStorage: createPreviewDiaryStorage(options.get("diary-test")),
  wechatStorage: createPreviewWechatStorage(
    options.get("wechat-test"),
    options.get("moments-test"),
  ),
  wechatStickerStorage: await createPreviewWechatStickerStorage(),
  logs,
});
mountPhone({
  apps: phone.apps,
  wallpaper: phone.wallpaper,
  homeScreen: phone.homeScreen,
  appearance: phone.appearance,
  initialApp:
    options.get("map") === "1"
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
