import test from "node:test";
import assert from "node:assert/strict";
import { createStSettings } from "./st-settings.ts";
import { defaultSettings } from "../../features/settings/phone-settings.ts";

test("ST adapter uses extension settings and the public backgrounds contract", async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  let saves = 0;
  const extensionSettings = {} as { ste_phone?: typeof defaultSettings };
  const context = {
    extensionSettings,
    saveSettingsDebounced: () => {
      saves++;
    },
    getRequestHeaders: () => ({ "X-CSRF-Token": "test" }),
  };
  globalThis.window = { SillyTavern: { getContext: () => context } } as unknown as Window &
    typeof globalThis;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/backgrounds/all");
    assert.equal(options!.method, "POST");
    assert.equal(options!.body, "{}");
    assert.deepEqual(options!.headers, { "X-CSRF-Token": "test" });
    return Response.json({ images: [{ filename: "夜空 #1.jpg", isAnimated: false }], config: {} });
  };
  try {
    const service = createStSettings();
    service.apply({ ...defaultSettings, blur: true });
    assert.equal(saves, 1);
    assert.equal(extensionSettings.ste_phone!.blur, true);
    assert.deepEqual(await service.backgrounds(), [
      { label: "夜空 #1.jpg", url: `/backgrounds/${encodeURIComponent("夜空 #1.jpg")}` },
    ]);
    assert.equal(createStSettings().getState().blur, true);
  } finally {
    globalThis.window = originalWindow;
    globalThis.fetch = originalFetch;
  }
});
