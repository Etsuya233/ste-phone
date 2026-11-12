import type { CharacterOverrideStorage } from "../../apps/data-source/ports/character-override-storage.ts";
import type { StChatMetadataStorage } from "./chat-metadata-storage.ts";

export function createStCharacterOverrideStorage(
  metadata: StChatMetadataStorage,
): CharacterOverrideStorage {
  return {
    read(chatId) {
      return metadata.read(chatId, "characterOverrides", "人物资料");
    },
    write(chatId, data, assertCurrent) {
      const saved = structuredClone(data);
      return metadata.write({
        chatId,
        key: "characterOverrides",
        label: "人物资料",
        update: () => saved,
        beforeSubmit: assertCurrent,
      });
    },
  };
}
