import test from "node:test";
import assert from "node:assert/strict";
import { PhoneSettingsService, defaultSettings } from "./settings-service.ts";
import type { SettingsStorage, PhoneSettings, PhoneSettingsV3 } from "./ports/settings-storage.ts";

function storageWith(initial?: PhoneSettings | PhoneSettingsV3): SettingsStorage {
  let stored = initial;
  return {
    read: () => stored,
    save: (settings) => {
      stored = settings;
    },
    listWallpapers: async () => [],
    uploadWallpaper: async () => {
      throw new Error("unused");
    },
    imageUrl: (path) => path,
  };
}

test("v3 migration adds the store and preserves wallpaper and model credentials", () => {
  const legacy: PhoneSettingsV3 = {
    version: 3,
    wallpaper: { kind: "image", path: "/wallpaper.png" },
    blur: true,
    modelConnections: [
      {
        id: "model",
        name: "Test",
        model: "test",
        baseUrl: "https://example.com/v1",
        apiKey: "secret",
        customHeaders: {},
      },
    ],
    defaultModelConnectionId: "model",
  };
  const storage = storageWith(legacy);
  const service = new PhoneSettingsService(storage);
  assert.deepEqual(service.getState(), {
    ...legacy,
    version: 4,
    homeLayout: defaultSettings.homeLayout,
  });
  assert.deepEqual(storage.read(), service.getState());
  assert.equal(service.modelConnections.getConnection("model").apiKey, "secret");
});

test("moving between home and dock, uninstalling and reinstalling survive a new session", () => {
  const storage = storageWith();
  const service = new PhoneSettingsService(storage);
  const home = service.homeScreen;
  const original = home.getSnapshot();
  home.move("settings", "dock", 0);
  home.move("stopwatch", "grid", 0);
  home.move("foundation", "grid", 0);
  home.uninstall("database");
  assert.equal(home.getSnapshot().grid.includes("database"), false);
  service.setWallpaper({ kind: "image", path: "/new.png" }, true);
  home.install("database");
  assert.deepEqual(home.getSnapshot(), {
    grid: ["foundation", "stopwatch", "data-source", "app-store", "database"],
    dock: ["settings"],
  });
  assert.deepEqual(new PhoneSettingsService(storage).homeScreen.getSnapshot(), home.getSnapshot());
  assert.deepEqual(original, defaultSettings.homeLayout);
  assert.equal(service.wallpaper.getSnapshot().url, "/new.png");
  assert.equal(Object.isFrozen(home.getSnapshot().grid), true);
});

test("the three system apps cannot be uninstalled and a full dock rejects a fifth icon", () => {
  const service = new PhoneSettingsService(storageWith());
  const home = service.homeScreen;
  const before = home.getSnapshot();
  for (const app of ["data-source", "settings", "app-store"] as const)
    assert.throws(() => home.uninstall(app), /不可卸载/);
  assert.equal(home.getSnapshot(), before);
  for (const app of ["data-source", "settings", "app-store"] as const)
    home.move(app, "dock", home.getSnapshot().dock.length);
  const full = home.getSnapshot();
  assert.throws(() => home.move("foundation", "dock", 4), /最多放四个/);
  assert.equal(home.getSnapshot(), full);
  home.move("stopwatch", "dock", 3);
  assert.equal(home.getSnapshot().dock[3], "stopwatch");
});

test("failed persistence leaves home layout, installation state and notifications unchanged", () => {
  const storage = storageWith(defaultSettings);
  storage.save = () => {
    throw new Error("save denied");
  };
  const home = new PhoneSettingsService(storage).homeScreen;
  let notified = 0;
  home.subscribe(() => notified++);
  const before = home.getSnapshot();
  assert.throws(() => home.uninstall("foundation"), /save denied/);
  assert.throws(() => home.move("settings", "dock", 0), /save denied/);
  assert.equal(home.getSnapshot(), before);
  assert.equal(notified, 0);
});
