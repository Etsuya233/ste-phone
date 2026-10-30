import { PhoneSettingsService } from "../../src/features/settings/phone-settings.ts";
import { mountPhone } from "../../src/frontend/host/mount-phone.tsx";
import { BackgroundDataSource } from "../../src/features/background/index.ts";
import { createPreviewMemory } from "./data-source-fixture.ts";

import { PhoneDatabaseService } from "../../src/features/database/index.ts";
import { MemoryDatabaseProvider } from "../../src/infrastructure/ste-memory/memory-database-provider.ts";
import { MemoryBackgroundProvider } from "../../src/infrastructure/ste-memory/memory-background-provider.ts";

const options = new URLSearchParams(window.location.search);
globalThis.STE_MEMORY_API = createPreviewMemory(options.get("data-state"));
const provider = new MemoryDatabaseProvider();
const database = new PhoneDatabaseService(provider);
const dataSource = new BackgroundDataSource(new MemoryBackgroundProvider(database, provider));
const settings = new PhoneSettingsService({
  read: () => {
    const stored = localStorage.getItem("ste-phone-preview-settings-v1");
    return stored ? JSON.parse(stored) : undefined;
  },
  save: (value) => localStorage.setItem("ste-phone-preview-settings-v1", JSON.stringify(value)),
  backgrounds: async () => [
    {
      label: "预览天空",
      url: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=800",
    },
  ],
});
mountPhone({
  settings,
  dataSource,
  database,
  initialApp:
    options.get("settings") === "1"
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
