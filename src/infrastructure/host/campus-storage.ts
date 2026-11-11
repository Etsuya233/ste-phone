import type { CampusData, CampusStorage } from "../../apps/campus-community/campus-domain.ts";
import { readCampusData } from "../../apps/campus-community/campus-records.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { StDiaryContext } from "./diary-storage.ts";

interface StoredCampus {
  version: 1;
  spaces: Record<string, CampusData>;
}

function readSpaces(metadata: Record<string, unknown>): StoredCampus["spaces"] {
  const phone = metadata.ste_phone as { campusCommunity?: StoredCampus } | undefined;
  const campus = phone?.campusCommunity;
  if (campus === undefined) {
    return {};
  }
  if (
    !campus ||
    campus.version !== 1 ||
    !campus.spaces ||
    Array.isArray(campus.spaces) ||
    typeof campus.spaces !== "object"
  ) {
    throw new Error("校园社区存储格式无效");
  }
  return campus.spaces;
}

function updateMetadata(metadata: Record<string, unknown>, space: string, data: CampusData) {
  return {
    ...(metadata.ste_phone as Record<string, unknown> | undefined),
    campusCommunity: { version: 1, spaces: { ...readSpaces(metadata), [space]: data } },
  };
}

export function createStCampusStorage(
  getContext: () => StDiaryContext,
  chat: ChatContext,
  request: typeof fetch = fetch,
): CampusStorage {
  function current(chatId: string): StDiaryContext {
    if (chat.getSnapshot()?.id !== chatId) {
      throw new Error("校园社区所属聊天已变化");
    }
    return getContext();
  }
  return {
    read(chatId, space) {
      const data = readSpaces(current(chatId).chatMetadata)[space];
      return data === undefined ? null : readCampusData(structuredClone(data));
    },
    async write(chatId, space, data) {
      // Capture chat identity, metadata and original messages before entering the async save.
      const context = current(chatId);
      const target = context.chatMetadata;
      const saved = readCampusData(structuredClone(data));
      const chatMetadata = { ...target, ste_phone: updateMetadata(target, space, saved) };
      const rows = [
        { chat_metadata: chatMetadata, user_name: "unused", character_name: "unused" },
        ...context.chat,
      ];
      const group = context.groupId != null;
      const character = group ? null : context.characters[Number(context.characterId)];
      if (!group && !character) {
        throw new Error("校园社区所属聊天缺少角色资料");
      }
      const body = JSON.stringify(
        character
          ? {
              ch_name: character.name,
              file_name: context.chatId,
              avatar_url: character.avatar,
              chat: rows,
              force: false,
            }
          : { id: context.chatId, chat: rows, force: false },
      );
      const response = await request(group ? "/api/chats/group/save" : "/api/chats/save", {
        method: "POST",
        headers: context.getRequestHeaders(),
        body,
      });
      if (!response.ok) {
        throw new Error(`校园社区保存失败（HTTP ${response.status}）`);
      }
      target.ste_phone = updateMetadata(target, space, saved);
      if (chat.getSnapshot()?.id === chatId) {
        const live = getContext().chatMetadata;
        if (live !== target) {
          live.ste_phone = updateMetadata(live, space, saved);
        }
      }
    },
  };
}
