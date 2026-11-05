import type { AgentMessage } from "@earendil-works/pi-agent-core";

export type MapPoint = [number, number];
export interface MapCartography {
  layer: "terrain" | "district" | "building";
  landuse?:
    | "residential"
    | "commercial"
    | "civic"
    | "industrial"
    | "forest"
    | "farmland"
    | "meadow"
    | "sand"
    | "rock";
  density?: "sparse" | "medium" | "dense";
  seed?: string;
  buildingSize?: number;
}
export interface MapFeature {
  id: string;
  kind: "place" | "region" | "road";
  name: string;
  aliases: string[];
  description: string;
  source: string;
  memoryId: string | null;
  parentId?: string | null;
  geometry: MapPoint[] | null;
  terrain: "land" | "water" | "park" | "building";
  cartography?: MapCartography;
  roadClass?: "arterial" | "street" | "path" | "bridge";
  /** 道路仅连接明确存在的地点；查询不能创造道路。 */
  connects: string[];
}
export interface MapEvent {
  id: string;
  title: string;
  placeIds: string[];
  storyTime: string | null;
  description: string;
  source: string;
}
export interface MapDocument {
  title: string;
  revision: number;
  features: MapFeature[];
  events: MapEvent[];
}
export interface MapData {
  version: 1;
  maps: Record<string, MapDocument>;
}
export interface MapStorage {
  read(chatId: string): MapData | null;
  write(chatId: string, data: MapData, signal?: AbortSignal): Promise<void>;
}
export type MapReply =
  | {
      type: "proposal";
      summary: string;
      upsert: MapFeature[];
      remove: string[];
      events: MapEvent[];
      title: string;
    }
  | { type: "query"; summary: string; featureIds: string[]; routeRoadIds: string[] };
export interface MapProposal {
  summary: string;
  baseRevision: number;
  map: MapDocument;
  affectedIds: string[];
}
export type MapToolStatus = "running" | "completed" | "failed";
export interface MapToolStep {
  id: string;
  name: string;
  label: string;
  status: MapToolStatus;
  input: unknown;
  output: string | null;
}
export interface MapConversationTurn {
  messages: AgentMessage[];
  id: string;
  instruction: string;
  thinking: string;
  tools: MapToolStep[];
  answer: string | null;
  error: string | null;
  status: "running" | "done" | "failed" | "cancelled";
}
export interface MapConversationStorage {
  read(chatId: string, scopeKey: string): MapConversationTurn[];
  write(chatId: string, scopeKey: string, turns: MapConversationTurn[]): void;
}

export interface MapSnapshot {
  progress?: string | null;
  chatId: string | null;
  map: MapDocument;
  proposal: MapProposal | null;
  status: "idle" | "reading" | "generating" | "saving";
  error: Error | null;
  conversation: MapConversationTurn[];
  highlightIds: string[];
  canUndo: boolean;
  scopeKey: string | null;
}
export const emptyMap = (): MapDocument => ({
  title: "我的地图",
  revision: 0,
  features: [],
  events: [],
});

export function readMapData(input: unknown): MapData {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("地图存储格式无效");
  }
  const value = input as MapData;
  if (
    value.version !== 1 ||
    !value.maps ||
    typeof value.maps !== "object" ||
    Array.isArray(value.maps)
  ) {
    throw new Error("地图存储版本无效");
  }
  for (const map of Object.values(value.maps)) {
    validateMap(map);
  }
  return value;
}

export function validateMap(map: MapDocument): void {
  if (
    typeof map.title !== "string" ||
    !map.title.trim() ||
    !Number.isSafeInteger(map.revision) ||
    map.revision < 0 ||
    !Array.isArray(map.features) ||
    !Array.isArray(map.events)
  ) {
    throw new Error("地图标题、版本或内容无效");
  }
  const ids = new Set<string>();
  const memories = new Set<string>();
  for (const feature of map.features) {
    validateFeature(feature);
    if (ids.has(feature.id)) {
      throw new Error(`地图身份重复：${feature.id}`);
    }
    ids.add(feature.id);
    if (feature.memoryId) {
      if (memories.has(feature.memoryId)) {
        throw new Error(`资料地点身份重复：${feature.memoryId}`);
      }
      memories.add(feature.memoryId);
    }
  }
  const places = new Set(map.features.filter((f) => f.kind === "place").map((f) => f.id));
  for (const feature of map.features) {
    if (
      feature.connects.some((id) => !places.has(id)) ||
      (feature.kind !== "road" && feature.connects.length)
    ) {
      throw new Error(`道路地点关联无效：${feature.name}`);
    }
    if (
      feature.parentId &&
      (feature.parentId === feature.id ||
        !map.features.some((parent) => parent.id === feature.parentId && parent.kind === "region"))
    ) {
      throw new Error(`区域归属无效：${feature.name}`);
    }
    const ancestors = new Set([feature.id]);
    let parentId = feature.parentId;
    while (parentId) {
      if (ancestors.has(parentId)) {
        throw new Error(`区域归属形成环路：${feature.name}`);
      }
      ancestors.add(parentId);
      parentId = map.features.find((parent) => parent.id === parentId)?.parentId;
    }
  }
  const eventIds = new Set<string>();
  for (const event of map.events) {
    if (
      !event ||
      typeof event.id !== "string" ||
      !event.id ||
      eventIds.has(event.id) ||
      typeof event.title !== "string" ||
      !event.title.trim() ||
      typeof event.description !== "string" ||
      typeof event.source !== "string" ||
      !event.source.trim() ||
      (event.storyTime !== null && typeof event.storyTime !== "string") ||
      !Array.isArray(event.placeIds) ||
      event.placeIds.some((id) => !places.has(id))
    ) {
      throw new Error("地图事件或地点关联无效");
    }
    eventIds.add(event.id);
  }
}

function validateFeature(f: MapFeature): void {
  if (
    !f ||
    typeof f.id !== "string" ||
    !f.id.trim() ||
    !["place", "region", "road"].includes(f.kind) ||
    typeof f.name !== "string" ||
    !f.name.trim() ||
    typeof f.description !== "string" ||
    typeof f.source !== "string" ||
    !f.source.trim() ||
    !Array.isArray(f.aliases) ||
    f.aliases.some((a) => typeof a !== "string") ||
    !Array.isArray(f.connects) ||
    f.connects.some((a) => typeof a !== "string") ||
    !["land", "water", "park", "building"].includes(f.terrain) ||
    (f.parentId !== undefined && f.parentId !== null && typeof f.parentId !== "string") ||
    (f.memoryId !== null && typeof f.memoryId !== "string")
  ) {
    throw new Error("地图要素字段无效");
  }
  validateCartography(f);
  if (f.geometry === null) {
    if (f.kind !== "place") {
      throw new Error("仅地点允许位置待定");
    }
    return;
  }
  const minimum = f.kind === "place" ? 1 : f.kind === "road" ? 2 : 3;
  if (
    !Array.isArray(f.geometry) ||
    f.geometry.length < minimum ||
    (f.kind === "place" && f.geometry.length !== 1) ||
    f.geometry.some(
      (p) =>
        !Array.isArray(p) ||
        p.length !== 2 ||
        p.some((n) => typeof n !== "number" || !Number.isFinite(n) || Math.abs(n) > 100000),
    )
  ) {
    throw new Error(`地图几何无效：${f.name}`);
  }
}

function validateCartography(feature: MapFeature): void {
  if (
    feature.roadClass !== undefined &&
    (feature.kind !== "road" ||
      !["arterial", "street", "path", "bridge"].includes(feature.roadClass))
  ) {
    throw new Error(`道路等级无效：${feature.name}`);
  }
  const style = feature.cartography;
  if (style === undefined) {
    return;
  }
  if (
    !style ||
    typeof style !== "object" ||
    Array.isArray(style) ||
    feature.kind !== "region" ||
    !["terrain", "district", "building"].includes(style.layer)
  ) {
    throw new Error(`地图制图层无效：${feature.name}`);
  }
  if (
    Object.keys(style).some(
      (key) => !["layer", "landuse", "density", "seed", "buildingSize"].includes(key),
    )
  ) {
    throw new Error(`未知地图制图字段：${feature.name}`);
  }
  if (
    style.landuse !== undefined &&
    ![
      "residential",
      "commercial",
      "civic",
      "industrial",
      "forest",
      "farmland",
      "meadow",
      "sand",
      "rock",
    ].includes(style.landuse)
  ) {
    throw new Error(`地块用途无效：${feature.name}`);
  }
  if (style.density !== undefined && !["sparse", "medium", "dense"].includes(style.density)) {
    throw new Error(`建筑密度无效：${feature.name}`);
  }
  if (style.seed !== undefined && (typeof style.seed !== "string" || !style.seed.trim())) {
    throw new Error(`制图种子无效：${feature.name}`);
  }
  if (
    style.buildingSize !== undefined &&
    (typeof style.buildingSize !== "number" ||
      !Number.isFinite(style.buildingSize) ||
      style.buildingSize < 2 ||
      style.buildingSize > 1000)
  ) {
    throw new Error(`装饰建筑尺寸须在2至1000之间：${feature.name}`);
  }
  if (
    (style.density !== undefined || style.buildingSize !== undefined) &&
    style.layer !== "district"
  ) {
    throw new Error(`仅街区支持装饰建筑密度和尺寸：${feature.name}`);
  }
  if (
    (feature.terrain === "water" && (style.layer !== "terrain" || style.landuse !== undefined)) ||
    (style.layer === "building" && feature.terrain !== "building") ||
    (style.layer === "district" && !["land", "building"].includes(feature.terrain)) ||
    (style.layer === "terrain" && feature.terrain === "building")
  ) {
    throw new Error(`地形与制图层不一致：${feature.name}`);
  }
}
