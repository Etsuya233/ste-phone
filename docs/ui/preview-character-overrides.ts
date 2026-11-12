import type { CharacterOverrideStorage } from "../../src/apps/data-source/ports/character-override-storage.ts";

export function createPreviewCharacterOverrideStorage(
  mode: string | null,
): CharacterOverrideStorage {
  const prefix = `ste-phone-preview-character-overrides:${mode ?? "default"}:`;
  let failNext = mode === "save-error";
  return {
    read(chatId) {
      const stored = localStorage.getItem(prefix + chatId);
      return stored === null ? undefined : JSON.parse(stored);
    },
    async write(chatId, data, assertCurrent) {
      assertCurrent?.();
      if (mode === "slow-save") {
        await new Promise<void>((resolve) => setTimeout(resolve, 1_500));
      }
      if (failNext) {
        failNext = false;
        throw new Error("模拟人物资料保存失败");
      }
      localStorage.setItem(prefix + chatId, JSON.stringify(data));
    },
  };
}
