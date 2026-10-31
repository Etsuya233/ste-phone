import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, PhoneSettingsService } from "./settings-service.ts";
import type {
  LegacyPhoneSettings,
  PhoneSettings,
  PhoneSettingsV2,
  SettingsStorage,
} from "./settings-service.ts";
import type { ModelConnection } from "./model-connections.ts";
const image = {
  path: "/user/images/ste-phone-wallpapers/a.png",
  url: "/user/images/ste-phone-wallpapers/a.png",
};
const library = {
  listWallpapers: async () => [image],
  uploadWallpaper: async () => image,
  imageUrl: (path: string) => path,
};
test("setting an uploaded wallpaper saves only the selected path and blur, and reconstructs a session", () => {
  let stored: PhoneSettings | undefined;
  let notifications = 0;
  const storage: SettingsStorage = {
    ...library,
    read: () => stored,
    save: (value) => {
      stored = value;
    },
  };
  const service = new PhoneSettingsService(storage);
  const unsubscribe = service.subscribe(() => {
    assert.equal(service.getState(), stored);
    notifications++;
  });
  service.setWallpaper({ kind: "image", path: image.path }, true);
  assert.equal(notifications, 1);
  assert.deepEqual(new PhoneSettingsService(storage).getState(), service.getState());
  assert.equal(service.imageUrl(service.getState().wallpaper), image.url);
  unsubscribe();
  service.setWallpaper(defaultSettings.wallpaper, defaultSettings.blur);
  assert.equal(notifications, 1);
});
test("version 1 migration discards host backgrounds and external URLs while preserving blur", () => {
  for (const url of ["https://example.com/external.png", "/backgrounds/old.jpg"]) {
    const legacy: LegacyPhoneSettings = {
      version: 1,
      wallpaper: { kind: "image", url, label: "old" },
      blur: true,
      savedUrls: [url],
    };
    let stored: PhoneSettings | LegacyPhoneSettings = legacy;
    const service = new PhoneSettingsService({
      ...library,
      read: () => stored,
      save: (value) => {
        stored = value;
      },
    });
    assert.deepEqual(service.getState(), {
      ...defaultSettings,
      wallpaper: { kind: "gradient" },
      blur: true,
      modelConnections: [],
      defaultModelConnectionId: null,
    });
    assert.deepEqual(stored, service.getState());
    assert.equal("savedUrls" in stored, false);
  }
});
test("failed save or upload leaves the currently applied wallpaper and subscribers unchanged", async () => {
  const service = new PhoneSettingsService({
    ...library,
    read: () => undefined,
    save: () => {
      throw new Error("storage denied");
    },
    uploadWallpaper: async () => {
      throw new Error("upload rejected");
    },
  });
  let notified = false;
  service.subscribe(() => {
    notified = true;
  });
  assert.throws(() => service.setWallpaper(defaultSettings.wallpaper, true), /storage denied/);
  await assert.rejects(
    service.uploadWallpaper(new Blob(["png"], { type: "image/png" })),
    /upload rejected/,
  );
  assert.equal(service.getState().blur, false);
  assert.equal(notified, false);
});
test("upload only accepts nonempty PNG, JPEG and WebP files within 10 MB", async () => {
  let uploads = 0;
  const service = new PhoneSettingsService({
    ...library,
    read: () => undefined,
    save: () => {},
    uploadWallpaper: async () => {
      uploads++;
      return image;
    },
  });
  for (const blob of [
    new Blob(["text"], { type: "text/plain" }),
    new Blob([], { type: "image/png" }),
    new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/webp" }),
  ])
    await assert.rejects(service.uploadWallpaper(blob));
  assert.equal(uploads, 0);
  for (const type of ["image/png", "image/jpeg", "image/webp"])
    assert.deepEqual(await service.uploadWallpaper(new Blob(["image"], { type })), image);
  assert.equal(uploads, 3);
});

const connection: ModelConnection = {
  id: "first",
  name: "本地模型",
  baseUrl: "http://127.0.0.1:8080/v1",
  apiKey: "",
  model: "test-model",
  customHeaders: { "X-Request-Tag": "phone" },
};

test("version 2 migration preserves wallpaper and starts without connections", () => {
  let stored: PhoneSettingsV2 | PhoneSettings = {
    version: 2,
    wallpaper: { kind: "image", path: image.path },
    blur: true,
  };
  const service = new PhoneSettingsService({
    ...library,
    read: () => stored,
    save: (settings) => {
      stored = settings;
    },
  });
  assert.deepEqual(service.getState(), {
    ...defaultSettings,
    wallpaper: { kind: "image", path: image.path },
    blur: true,
  });
  assert.equal(stored, service.getState());
  assert.throws(() => service.defaultModelConnection(), /请先选择默认模型连接/);
});

test("connection edits and wallpaper updates preserve each other's current settings", () => {
  let stored: PhoneSettings | undefined;
  const storage: SettingsStorage = {
    ...library,
    read: () => stored,
    save: (settings) => {
      stored = settings;
    },
  };
  const service = new PhoneSettingsService(storage);
  service.saveModelConnection(connection);
  assert.equal(service.getState().defaultModelConnectionId, connection.id);
  service.setWallpaper({ kind: "image", path: image.path }, true);
  service.saveModelConnection({ ...connection, name: "新名称", model: "new-model" });
  assert.equal(service.getState().wallpaper.kind, "image");
  assert.equal(service.getState().blur, true);
  assert.equal(service.defaultModelConnection().model, "new-model");
  assert.equal(service.getState().modelConnections.length, 1);
  assert.deepEqual(new PhoneSettingsService(storage).getState(), service.getState());
});

test("default selection is explicit after the first connection and deleting it clears the choice", () => {
  const service = new PhoneSettingsService({ ...library, read: () => undefined, save: () => {} });
  service.saveModelConnection(connection);
  service.saveModelConnection({ ...connection, id: "second", model: "second-model" });
  assert.equal(service.defaultModelConnection().id, "first");
  service.selectDefaultModelConnection("second");
  assert.equal(service.defaultModelConnection().model, "second-model");
  service.deleteModelConnection("second");
  assert.equal(service.getState().defaultModelConnectionId, null);
  assert.throws(() => service.defaultModelConnection(), /请先选择默认模型连接/);
  service.saveModelConnection({ ...connection, id: "third" });
  assert.equal(service.getState().defaultModelConnectionId, null);
  service.selectDefaultModelConnection("first");
  service.selectDefaultModelConnection(null);
  assert.equal(service.getState().defaultModelConnectionId, null);
  assert.throws(() => service.selectDefaultModelConnection("missing"), /模型连接不存在/);
  assert.throws(() => service.deleteModelConnection("missing"), /模型连接不存在/);
});

test("saved and default connection headers are copied for independent runs", () => {
  const service = new PhoneSettingsService({ ...library, read: () => undefined, save: () => {} });
  const draft = { ...connection, customHeaders: { "X-Request-Tag": "original" } };
  service.saveModelConnection(draft);
  draft.customHeaders["X-Request-Tag"] = "draft-change";
  const firstRun = service.defaultModelConnection();
  assert.equal(firstRun.customHeaders["X-Request-Tag"], "original");
  service.saveModelConnection({ ...connection, customHeaders: { "X-Request-Tag": "edited" } });
  assert.equal(firstRun.customHeaders["X-Request-Tag"], "original");
  firstRun.customHeaders["X-Request-Tag"] = "run-change";
  assert.equal(service.defaultModelConnection().customHeaders["X-Request-Tag"], "edited");
});

test("invalid connections and failed saves leave settings and subscribers unchanged", () => {
  const service = new PhoneSettingsService({ ...library, read: () => undefined, save: () => {} });
  let notifications = 0;
  service.subscribe(() => notifications++);
  assert.throws(() => service.saveModelConnection({ ...connection, model: " " }), /模型名称/);
  assert.deepEqual(service.getState(), defaultSettings);
  assert.equal(notifications, 0);
  const failing = new PhoneSettingsService({
    ...library,
    read: () => undefined,
    save: () => {
      throw new Error("settings denied");
    },
  });
  assert.throws(() => failing.saveModelConnection(connection), /settings denied/);
  assert.deepEqual(failing.getState(), defaultSettings);
});

test("public readers are stable and credential copies cannot change settings", () => {
  const service = new PhoneSettingsService({ ...library, read: () => undefined, save: () => {} });
  const wallpaper = service.wallpaper.getSnapshot();
  assert.equal(service.wallpaper.getSnapshot(), wallpaper);
  service.setWallpaper({ kind: "image", path: image.path }, true);
  assert.deepEqual(service.wallpaper.getSnapshot(), {
    wallpaper: { kind: "image", path: image.path },
    blur: true,
    url: image.url,
  });
  const connection: ModelConnection = {
    id: "public",
    name: "Public",
    model: "text",
    baseUrl: "https://example.com/v1",
    apiKey: "private",
    customHeaders: { Authorization: "private-header" },
  };
  service.saveModelConnection(connection);
  const summary = service.modelConnections.getSnapshot();
  assert.equal(service.modelConnections.getSnapshot(), summary);
  assert.deepEqual(summary.connections, [{ id: "public", name: "Public", model: "text" }]);
  const copy = service.modelConnections.getConnection("public");
  (copy.customHeaders as Record<string, string>).Authorization = "modified";
  assert.equal(
    service.modelConnections.getConnection("public").customHeaders.Authorization,
    "private-header",
  );
  service.deleteModelConnection("public");
  assert.equal(copy.apiKey, "private");
  assert.equal(summary.connections.length, 1);
  assert.throws(() => service.modelConnections.getConnection("public"), /不存在/);
});
