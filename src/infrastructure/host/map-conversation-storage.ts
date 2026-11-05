import type {
  MapAgentStep,
  MapConversationStorage,
  MapConversationTurn,
  MapToolStep,
} from "../../apps/map/map.ts";

type StoredTurn = Omit<MapConversationTurn, "steps"> & {
  steps?: MapAgentStep[];
  thinking?: string;
  tools?: Omit<MapToolStep, "kind">[];
};

/** 旧版对话把思考和工具分开保存，读取时合并为同一条时间线。 */
function readTurn(turn: StoredTurn): MapConversationTurn {
  const { thinking, tools, steps, ...rest } = turn;
  return {
    ...rest,
    steps: steps ?? [
      ...(thinking
        ? [{ kind: "thinking" as const, id: `${turn.id}-thinking`, text: thinking }]
        : []),
      ...(tools ?? []).map((tool) => ({ ...tool, kind: "tool" as const })),
    ],
  };
}

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
      const turns = JSON.parse(raw) as StoredTurn[];
      // 刷新时原来的任务已不存在，保留提交的用户指令并结束其运行状态。
      return turns.map((turn) => {
        const normalized = readTurn(turn);
        return normalized.status === "running"
          ? { ...normalized, status: "cancelled" }
          : normalized;
      });
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
