import { createPreviewSettingsStorage } from "./preview-wallpapers.ts";
import { createPreviewAiTransport } from "./preview-ai-transport.ts";
import { createPreviewChatContext } from "./preview-chat-context.ts";
import { createPreviewDiaryStorage } from "./preview-diary-storage.ts";
import { createPhone } from "../../src/bootstrap/create-phone.tsx";
import { mountPhone } from "../../src/frontend/host/mount-phone.tsx";
import { createPreviewMemory } from "./data-source-fixture.ts";

import { MemoryDatabaseProvider } from "../../src/infrastructure/ste-memory/memory-database-provider.ts";

const options = new URLSearchParams(window.location.search);
globalThis.STE_MEMORY_API = createPreviewMemory(options.get("data-state"));
const phone = createPhone({
  settingsStorage: await createPreviewSettingsStorage(),
  aiTransport: createPreviewAiTransport(options.get("diary-test") ?? options.get("model-test")),
  chat: createPreviewChatContext(),
  dataProvider: new MemoryDatabaseProvider(),
  diaryStorage: createPreviewDiaryStorage(options.get("diary-test")),
});
mountPhone({
  apps: phone.apps,
  wallpaper: phone.wallpaper,
  homeScreen: phone.homeScreen,
  initialApp:
    options.get("diary") === "1"
      ? "diary"
      : options.get("app-store") === "1"
        ? "app-store"
        : options.get("settings") === "1"
          ? "settings"
          : options.get("database") === "1"
            ? "database"
            : options.get("data-source") === "1"
              ? "data-source"
              : options.get("foundation") === "1"
                ? "foundation"
                : "home",
  responsive: options.get("responsive") === "1",
  draggable: options.get("draggable") === "1",
});
