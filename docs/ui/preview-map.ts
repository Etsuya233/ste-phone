import type { Message, ToolCall, ToolResultMessage } from "@earendil-works/pi-ai";
import { findMapRoute } from "../../src/apps/map/map-query.ts";
import {
  readMapData,
  type MapDocument,
  type MapFeature,
  type MapStorage,
} from "../../src/apps/map/map.ts";

const feature = (
  value: Partial<MapFeature> & Pick<MapFeature, "id" | "kind" | "name" | "geometry">,
): MapFeature => ({
  aliases: [],
  description: "",
  source: "独立预览示例",
  memoryId: null,
  terrain: "land",
  connects: [],
  ...value,
});

/** 固定几何供交互验收；生产代码不依赖预览资料。 */
export const previewMap: MapDocument = {
  title: "椿城",
  revision: 1,
  features: [
    feature({
      id: "old-town",
      kind: "region",
      name: "旧城区",
      terrain: "building",
      geometry: [
        [80, 80],
        [510, 65],
        [560, 350],
        [130, 400],
      ],
      description: "沿河而建的老街与居民区。",
    }),
    feature({
      id: "river",
      kind: "region",
      name: "椿河",
      terrain: "water",
      geometry: [
        [20, 430],
        [230, 390],
        [440, 420],
        [690, 360],
        [740, 410],
        [470, 480],
        [210, 450],
        [20, 490],
      ],
    }),
    feature({
      id: "park",
      kind: "region",
      name: "北岸公园",
      terrain: "park",
      geometry: [
        [420, 470],
        [650, 450],
        [690, 660],
        [450, 680],
      ],
    }),
    feature({
      id: "station",
      kind: "place",
      name: "椿城车站",
      geometry: [[170, 170]],
      description: "旅人进入椿城的第一站。",
    }),
    feature({
      id: "library",
      kind: "place",
      name: "市立图书馆",
      aliases: ["图书馆"],
      geometry: [[420, 270]],
      description: "落地窗朝向椿河，收藏着城里的旧档案。",
    }),
    feature({
      id: "cafe",
      kind: "place",
      name: "河畔咖啡馆",
      geometry: [[320, 360]],
      description: "临河小店，傍晚可看见对岸灯火。",
    }),
    feature({ id: "square", kind: "place", name: "钟楼广场", geometry: [[280, 230]] }),
    feature({ id: "north-gate", kind: "place", name: "公园北门", geometry: [[530, 580]] }),
    feature({
      id: "main-road",
      kind: "road",
      name: "钟楼路",
      geometry: [
        [170, 170],
        [280, 230],
        [420, 270],
      ],
      connects: ["station", "library"],
    }),
    feature({
      id: "river-road",
      kind: "road",
      name: "临河路",
      geometry: [
        [280, 230],
        [290, 310],
        [320, 360],
      ],
      connects: ["square", "cafe"],
    }),
    feature({
      id: "unknown",
      kind: "place",
      name: "旧天文台",
      geometry: null,
      description: "资料只提到城郊，具体位置待定。",
    }),
  ],
  events: [
    {
      id: "reading",
      title: "河畔朗读会",
      placeIds: ["library"],
      storyTime: null,
      description: "大家约在图书馆相聚，时间待确认。",
      source: "独立预览示例",
    },
  ],
};

export function createPreviewMapStorage(mode: string | null): MapStorage {
  const key = (chatId: string) => `ste-phone-preview-map:${chatId}`;
  return {
    read(chatId) {
      const saved = localStorage.getItem(key(chatId));
      if (saved !== null) {
        return readMapData(JSON.parse(saved));
      }
      return mode === "empty"
        ? null
        : {
            version: 1,
            maps: {
              [JSON.stringify(["ste-memory", "preview-space"])]: structuredClone(previewMap),
            },
          };
    },
    async write(chatId, data, signal) {
      signal?.throwIfAborted();
      if (mode === "save-error") {
        throw new Error("预览：地图保存失败，提案已保留");
      }
      localStorage.setItem(key(chatId), JSON.stringify(readMapData(data)));
    },
  };
}

interface PreviewMapInstruction {
  instruction: string;
  selectedId: string | null;
}

function toolValue(result: ToolResultMessage): unknown {
  const text = result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  const reply = JSON.parse(text) as
    { ok: true; value: unknown } | { ok: false; error: { message: string } };
  if (!reply.ok) {
    throw new Error(reply.error.message);
  }
  return reply.value;
}

/** The simulator advances only after Pi returns the real result of each tool call. */
export function previewMapReply(
  messages: readonly Message[],
  mode: string | null,
): string | ToolCall {
  const userIndex = messages.findLastIndex((message) => message.role === "user");
  const user = messages[userIndex]!;
  if (user.role !== "user") {
    throw new Error("缺少本轮地图指令");
  }
  const text =
    typeof user.content === "string"
      ? user.content
      : user.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("");
  const input = JSON.parse(text) as PreviewMapInstruction;
  const results = new Map(
    messages
      .slice(userIndex + 1)
      .filter((message) => message.role === "toolResult")
      .map((result) => [result.toolName, toolValue(result)]),
  );
  const call = (name: string, args: ToolCall["arguments"] = {}): ToolCall => ({
    type: "toolCall",
    id: `preview-${name}-${messages.length}`,
    name,
    arguments: args,
  });
  if (!results.has("map_story_summary")) {
    return call("map_story_summary");
  }
  if (!results.has("map_read")) {
    return call("map_read");
  }
  const map = results.get("map_read") as MapDocument;
  if (/查询|在哪|定位|路线|怎么走/.test(input.instruction)) {
    return mode === "invalid" ? "模拟非法地图 JSON" : previewMapQuery(map, input.instruction);
  }
  const { summary, ...patch } = previewMapPatch(map, input);
  if (!results.has("map_apply")) {
    return call("map_apply", patch);
  }
  if (!results.has("map_check")) {
    return call("map_check");
  }
  return mode === "invalid" ? "模拟非法地图 JSON" : JSON.stringify({ type: "proposal", summary });
}

function previewMapQuery(map: MapDocument, instruction: string): string {
  const targets = map.features.filter(
    (item) =>
      item.kind === "place" &&
      (instruction.includes(item.name) ||
        item.aliases.some((alias) => instruction.includes(alias))),
  );
  return JSON.stringify({
    type: "query",
    summary: targets.length
      ? "已在地图上标出查询地点；路线仅使用现有道路。"
      : "当前地图中没有找到明确地点。",
    featureIds: targets.map((item) => item.id),
    routeRoadIds:
      /路线|怎么走/.test(instruction) && targets.length === 2
        ? findMapRoute(map, targets[0]!.id, targets[1]!.id)
        : [],
  });
}

function previewMapPatch(map: MapDocument, input: PreviewMapInstruction) {
  if (!map.features.length) {
    return {
      summary: "绘制椿城的河流、街区与主要地点，未确定的地点保留待定。",
      title: previewMap.title,
      upsert: previewMap.features,
      remove: [],
      events: previewMap.events,
    };
  }
  const selected = map.features.find((item) => item.id === input.selectedId);
  const upsert = selected
    ? [{ ...selected, description: `${selected.description} 【模拟调整】${input.instruction}` }]
    : [
        feature({
          id: "map-preview-bookshop",
          kind: "place",
          name: "河畔书店",
          geometry: [[360, 340]],
          description: `【模拟新增】${input.instruction}`,
        }),
      ];
  return {
    summary: selected
      ? `调整「${selected.name}」，其他要素保持原位。`
      : "在河畔新增一间书店，其他要素保持原位。",
    title: map.title,
    upsert,
    remove: [],
    events: [],
  };
}
