import assert from "node:assert/strict";
import test from "node:test";
import { migrateData } from "../../core/storage/migrations.ts";
import { phoneSettingsMigrationPlan } from "./settings-migrations.ts";
import { defaultSettings, PhoneSettingsService } from "./settings-service.ts";
import type { PhoneSettings, SettingsStorage } from "./ports/settings-storage.ts";

const connections = [
  {
    id: "preserved",
    name: "模型",
    model: "chat-model",
    baseUrl: "https://example.com/v1",
    apiKey: "saved-key",
    customHeaders: { Authorization: "saved-header" },
  },
];
const wallpaper = { kind: "image", path: "/saved.png" };
const homeLayout = { grid: ["wechat", "diary"], dock: ["settings"] };
const legacyDefaults = {
  version: 6,
  wechatHistoryMessageLimit: 100,
  wechatSendMode: "delayed",
  wallpaper: { kind: "gradient" },
  blur: true,
  modelConnections: [],
  defaultModelConnectionId: null,
  homeLayout: {
    grid: [
      "diary",
      "wechat",
      "database",
      "data-source",
      "logs",
      "foundation",
      "settings",
      "app-store",
      "gallery",
      "image-playground",
    ],
    dock: ["stopwatch"],
  },
};

test("settings versions 1–5 retain their released upgrade results and record one direct step", () => {
  const common = {
    wallpaper,
    blur: true,
    modelConnections: connections,
    defaultModelConnectionId: "preserved",
  };
  const samples = [
    {
      raw: {
        version: 1,
        blur: true,
        wallpaper: { kind: "host", url: "/old.jpg", label: "旧壁纸" },
        savedUrls: ["/old.jpg"],
      },
      expected: legacyDefaults,
    },
    {
      raw: { version: 2, wallpaper, blur: true },
      expected: { ...legacyDefaults, wallpaper },
    },
    {
      raw: { version: 3, ...common },
      expected: { ...legacyDefaults, ...common },
    },
    {
      raw: { version: 4, ...common, homeLayout },
      expected: { ...legacyDefaults, ...common, homeLayout },
    },
    {
      raw: { version: 5, ...common, homeLayout, wechatSendMode: "immediate" },
      expected: { ...legacyDefaults, ...common, homeLayout, wechatSendMode: "immediate" },
    },
  ];
  for (const { raw, expected } of samples) {
    const original = structuredClone(raw);
    const migrated = migrateData(raw, phoneSettingsMigrationPlan);
    assert.deepEqual(migrated.data, expected);
    assert.deepEqual(migrated.executed, [
      { from: raw.version, to: 6, name: `settings-v${raw.version}-to-v6` },
    ]);
    assert.deepEqual(raw, original);
  }
});

function settingsStorage(raw: unknown, save: SettingsStorage["save"]): SettingsStorage {
  return {
    read: () => raw as PhoneSettings,
    save,
    imageUrl: (path) => path,
    listWallpapers: async () => [],
    uploadWallpaper: async () => {
      throw new Error("unused");
    },
  };
}

test("initial reads save only a migration or catalog cleanup, and never mutate stored input", () => {
  let saves = 0;
  const countSave = () => saves++;
  new PhoneSettingsService(settingsStorage(undefined, countSave));
  const current = structuredClone(defaultSettings);
  new PhoneSettingsService(settingsStorage(current, countSave));
  assert.equal(saves, 0);
  assert.deepEqual(migrateData(current, phoneSettingsMigrationPlan).executed, []);
  const legacy = { version: 2, wallpaper, blur: true };
  new PhoneSettingsService(settingsStorage(legacy, countSave));
  assert.equal(saves, 1);
  assert.equal(legacy.version, 2);
  const unknownApps = {
    ...current,
    homeLayout: { grid: ["wechat", "removed"], dock: ["settings"] },
  };
  const service = new PhoneSettingsService(settingsStorage(unknownApps, countSave));
  assert.equal(saves, 2);
  assert.deepEqual(service.getState().homeLayout, { grid: ["wechat"], dock: ["settings"] });
  assert.deepEqual(unknownApps.homeLayout.grid, ["wechat", "removed"]);
});

test("damaged historical or current settings and unsupported versions fail before saving", () => {
  const missingVersion = { ...defaultSettings } as Partial<PhoneSettings>;
  delete missingVersion.version;
  const samples = [
    null,
    missingVersion,
    { ...defaultSettings, version: 7 },
    { version: 1, blur: true, wallpaper: { kind: "host" }, savedUrls: [42] },
    { version: 2, wallpaper },
    { ...defaultSettings, blur: "yes" },
    { ...defaultSettings, wallpaper: { kind: "image", path: "" } },
    { ...defaultSettings, modelConnections: [{ ...connections[0], customHeaders: null }] },
    { ...defaultSettings, homeLayout: { grid: [42], dock: [] } },
    { ...defaultSettings, wechatSendMode: "unknown" },
    { ...defaultSettings, wechatHistoryMessageLimit: 0 },
  ];
  let saves = 0;
  for (const raw of samples) {
    const original = structuredClone(raw);
    assert.throws(() => new PhoneSettingsService(settingsStorage(raw, () => saves++)));
    assert.deepEqual(raw, original);
  }
  assert.equal(saves, 0);
});
