import test from "node:test";
import assert from "node:assert/strict";
import { defaultSettings, PhoneSettingsService } from "./phone-settings.ts";
import type { LegacyPhoneSettings, PhoneSettings, SettingsStorage } from "./phone-settings.ts";
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
  service.apply({ version: 2, wallpaper: { kind: "image", path: image.path }, blur: true });
  assert.equal(notifications, 1);
  assert.deepEqual(new PhoneSettingsService(storage).getState(), service.getState());
  assert.equal(service.imageUrl(service.getState().wallpaper), image.url);
  unsubscribe();
  service.apply(defaultSettings);
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
      version: 2,
      wallpaper: { kind: "gradient" },
      blur: true,
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
  assert.throws(() => service.apply({ ...defaultSettings, blur: true }), /storage denied/);
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
