import { PhoneSettingsService } from "../../features/settings/phone-settings.ts";
import type { PhoneSettings } from "../../features/settings/phone-settings.ts";
interface StContext {
  extensionSettings: { ste_phone?: PhoneSettings };
  saveSettingsDebounced: () => void;
  getRequestHeaders: () => Record<string, string>;
}
declare global {
  interface Window {
    SillyTavern: { getContext: () => StContext };
  }
}
export function createStSettings(): PhoneSettingsService {
  const context = window.SillyTavern.getContext();
  return new PhoneSettingsService({
    read: () => context.extensionSettings.ste_phone,
    save: (settings) => {
      context.extensionSettings.ste_phone = settings;
      context.saveSettingsDebounced();
    },
    backgrounds: async () => {
      const response = await fetch("/api/backgrounds/all", {
        method: "POST",
        headers: context.getRequestHeaders(),
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error(`读取 ST 背景失败（${response.status}）`);
      const result = (await response.json()) as {
        images: { filename: string; isAnimated: boolean }[];
      };
      return result.images.map((image) => ({
        label: image.filename,
        url: `/backgrounds/${encodeURIComponent(image.filename)}`,
      }));
    },
  });
}
