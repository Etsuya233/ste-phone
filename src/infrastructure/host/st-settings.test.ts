import test from "node:test";
import assert from "node:assert/strict";
import { createStSettingsStorage } from "./st-settings.ts";
import { defaultSettings, PhoneSettingsService } from "../../apps/settings/settings-service.ts";
import type { PhoneSettings, LegacyPhoneSettings } from "../../apps/settings/settings-service.ts";

test("native ST image requests use the fixed account-relative folder and unique generated names", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let saves = 0;
  const extensionSettings: { ste_phone?: PhoneSettings | LegacyPhoneSettings } = {};
  const context = {
    extensionSettings,
    saveSettingsDebounced: () => {
      saves++;
    },
    getRequestHeaders: () => ({ "X-CSRF-Token": "test" }),
  };
  globalThis.window = { SillyTavern: { getContext: () => context } } as unknown as Window &
    typeof globalThis;
  const names = new Set<string>();
  globalThis.fetch = async (url, options) => {
    assert.equal(options!.method, "POST");
    assert.deepEqual(options!.headers, { "X-CSRF-Token": "test" });
    const body = JSON.parse(options!.body as string);
    if (url === "/api/images/list") {
      assert.deepEqual(body, {
        folder: "ste-phone-wallpapers",
        sortField: "date",
        sortOrder: "desc",
      });
      return Response.json(["夜空 #1.jpg"]);
    }
    assert.equal(url, "/api/images/upload");
    assert.deepEqual(Object.keys(body).sort(), ["ch_name", "filename", "format", "image"]);
    assert.equal(body.ch_name, "ste-phone-wallpapers");
    assert.equal(body.format, "png");
    assert.equal(body.image, Buffer.from("png bytes").toString("base64"));
    assert.match(body.filename, /^[a-f0-9]{32}$/);
    assert.equal(names.has(body.filename), false);
    names.add(body.filename);
    return Response.json({ path: `/user/images/ste-phone-wallpapers/${body.filename}.png` });
  };
  try {
    const service = new PhoneSettingsService(createStSettingsStorage());
    service.setWallpaper(defaultSettings.wallpaper, true);
    assert.equal(saves, 1);
    const path = `/user/images/ste-phone-wallpapers/${encodeURIComponent("夜空 #1.jpg")}`;
    assert.deepEqual(await service.listWallpapers(), [{ path, url: path }]);
    for (let index = 0; index < 2; index++) {
      const uploaded = await service.uploadWallpaper(
        new Blob(["png bytes"], { type: "image/png" }),
      );
      assert.match(uploaded.path, /^\/user\/images\/ste-phone-wallpapers\/[a-f0-9]{32}\.png$/);
      assert.equal(uploaded.path, uploaded.url);
    }
    assert.equal(new PhoneSettingsService(createStSettingsStorage()).getState().blur, true);
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
test("native upload failure does not select or persist a wallpaper", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let saves = 0;
  globalThis.window = {
    SillyTavern: {
      getContext: () => ({
        extensionSettings: {},
        saveSettingsDebounced: () => {
          saves++;
        },
        getRequestHeaders: () => ({}),
      }),
    },
  } as unknown as Window & typeof globalThis;
  globalThis.fetch = async () => new Response("denied", { status: 403 });
  try {
    const service = new PhoneSettingsService(createStSettingsStorage());
    await assert.rejects(
      service.uploadWallpaper(new Blob(["image"], { type: "image/png" })),
      /上传失败（403）/,
    );
    assert.deepEqual(service.getState(), defaultSettings);
    assert.equal(saves, 0);
    await assert.rejects(service.listWallpapers(), /读取失败（403）/);
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
