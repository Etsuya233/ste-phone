import type { CampusData, CampusStorage } from "../../apps/campus-community/campus-domain.ts";
import { readCampusData } from "../../apps/campus-community/campus-records.ts";
import type { StChatMetadataStorage } from "./chat-metadata-storage.ts";

interface StoredCampus {
  version: 1;
  spaces: Record<string, CampusData>;
}

function readSpaces(value: unknown): StoredCampus["spaces"] {
  if (value === undefined) {
    return {};
  }
  const campus = value as StoredCampus;
  if (
    !campus ||
    campus.version !== 1 ||
    !campus.spaces ||
    Array.isArray(campus.spaces) ||
    typeof campus.spaces !== "object"
  ) {
    throw new Error("Twitter存储格式无效");
  }
  return campus.spaces;
}

export function createStCampusStorage(metadata: StChatMetadataStorage): CampusStorage {
  return {
    read(chatId, space) {
      const data = readSpaces(metadata.read(chatId, "campusCommunity", "Twitter"))[space];
      return data === undefined ? null : readCampusData(structuredClone(data));
    },
    async write(chatId, space, data) {
      const saved = readCampusData(structuredClone(data));
      await metadata.write({
        chatId,
        key: "campusCommunity",
        label: "Twitter",
        update: (previous) => ({ version: 1, spaces: { ...readSpaces(previous), [space]: saved } }),
        updateDetached: true,
      });
    },
  };
}
