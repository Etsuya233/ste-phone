import type { MapConversationStorage, MapConversationTurn } from "../../apps/map/map.ts";

export function createMapConversationStorage(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  namespace: string,
): MapConversationStorage {
  const key = (chatId: string, scopeKey: string) => namespace + JSON.stringify([chatId, scopeKey]);
  return {
    read(chatId, scopeKey) {
      const raw = storage.getItem(key(chatId, scopeKey));
      if (raw === null) {
        return [];
      }
      const turns = JSON.parse(raw) as MapConversationTurn[];
      // 刷新时原来的任务已不存在，保留提交的用户指令并结束其运行状态。
      return turns.map((turn) =>
        turn.status === "running" ? { ...turn, status: "cancelled" } : turn,
      );
    },
    write(chatId, scopeKey, turns) {
      const storageKey = key(chatId, scopeKey);
      if (turns.length) {
        storage.setItem(storageKey, JSON.stringify(turns));
      } else {
        storage.removeItem(storageKey);
      }
    },
  };
}
