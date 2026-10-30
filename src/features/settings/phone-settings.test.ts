import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, PhoneSettingsService, wallpaperUrl } from "./phone-settings.ts";

test("applying wallpaper persists before notifying, and reconstructs a new settings session", () => {
  let stored = undefined as ReturnType<PhoneSettingsService["getState"]> | undefined;
  let notifications = 0;
  const storage = {
    read: () => stored,
    save: (value: NonNullable<typeof stored>) => {
      stored = value;
    },
    backgrounds: async () => [],
  };
  const service = new PhoneSettingsService(storage);
  const unsubscribe = service.subscribe(() => {
    assert.equal(service.getState(), stored);
    notifications++;
  });
  const url = wallpaperUrl("https://example.com/wallpaper a.jpg");
  service.apply({
    version: 1,
    wallpaper: { kind: "image", label: "自定义壁纸", url },
    blur: true,
    savedUrls: [url],
  });
  assert.equal(notifications, 1);
  assert.deepEqual(new PhoneSettingsService(storage).getState(), service.getState());
  unsubscribe();
  service.apply(defaultSettings);
  assert.equal(notifications, 1);
});
test("failed host save leaves the currently applied wallpaper and subscribers unchanged", () => {
  const service = new PhoneSettingsService({
    read: () => undefined,
    save: () => {
      throw new Error("storage denied");
    },
    backgrounds: async () => [],
  });
  let notified = false;
  service.subscribe(() => {
    notified = true;
  });
  assert.throws(() => service.apply({ ...defaultSettings, blur: true }), /storage denied/);
  assert.equal(service.getState().blur, false);
  assert.equal(notified, false);
});
test("custom wallpaper addresses only accept absolute HTTP and HTTPS images", () => {
  assert.equal(wallpaperUrl("https://example.com/a b.jpg"), "https://example.com/a%20b.jpg");
  for (const url of [
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "file:///wallpaper.png",
    "/wallpaper.png",
  ])
    assert.throws(() => wallpaperUrl(url));
});
