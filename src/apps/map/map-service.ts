import type { AiTransport } from "../../core/ai/public.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import {
  emptyMap,
  type MapData,
  type MapDocument,
  type MapSnapshot,
  type MapStorage,
  type MapPoint,
} from "./map.ts";
import { mapScope, stableMapKey } from "./map-context.ts";
import { generateMapTurn } from "./map-generation.ts";
import { createMapStoryReader } from "./map-tool-story.ts";
import type { PhoneLog } from "../logs/public.ts";

interface Dependencies {
  storage: MapStorage;
  data: DataAppPublic;
  chat: ChatContext;
  connections: ModelConnectionsReader;
  transport: AiTransport;
  logs?: PhoneLog;
}
interface Task {
  controller: AbortController;
  session: object;
  chatId: string;
  scopeKey: string;
}

/** 地图提案只在显式应用后写入；生成任务固定聊天、空间和本次会话。 */
export class MapService {
  readonly #deps: Dependencies;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: (() => void)[];
  #chatId: string | null;
  #data: MapData;
  #session = {};
  #task: Task | null = null;
  #reservation: object | null = null;
  #saving = false;
  #preparing = 0;
  #undo: MapDocument | null = null;
  #binding: string;
  #snapshot: MapSnapshot;
  constructor(deps: Dependencies) {
    this.#deps = deps;
    this.#chatId = deps.chat.getSnapshot()?.id ?? null;
    this.#data = this.#chatId
      ? (deps.storage.read(this.#chatId) ?? { version: 1, maps: {} })
      : { version: 1, maps: {} };
    this.#binding = this.#sourceBinding();
    const entry = Object.entries(this.#data.maps).at(-1);
    this.#snapshot = {
      chatId: this.#chatId,
      map: entry?.[1] ?? emptyMap(),
      scopeKey: entry?.[0] ?? null,
      proposal: null,
      status: "idle",
      error: null,
      answer: null,
      highlightIds: [],
      canUndo: false,
      storyTables: [],
    };
    this.#unsubscribe = [deps.chat.subscribe(this.#changed), deps.data.subscribe(this.#changed)];
  }
  getSnapshot = (): MapSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async prepare(): Promise<boolean> {
    const version = ++this.#preparing;
    try {
      const schema = await this.#deps.data.describe(mapScope(this.#deps.data));
      if (version !== this.#preparing) {
        return false;
      }
      const scopeKey = stableMapKey(schema);
      if (scopeKey !== this.#snapshot.scopeKey) {
        if (this.#task) {
          this.cancel();
        }
        this.#undo = null;
        this.#publish({
          map: this.#data.maps[scopeKey] ?? emptyMap(),
          scopeKey,
          canUndo: false,
          proposal: null,
          highlightIds: [],
        });
      }
      const previous = this.#snapshot.storyTables;
      const storyTables = schema.objects
        .filter((table) => table.name.startsWith("src_"))
        .map((table) => ({
          name: table.name,
          description: table.description,
          selected:
            previous.find((item) => item.name === table.name)?.selected ??
            /地点|地理|位置|区域|地图|场景|location|place|region|world|story_state|chronicle|plot_summar|important_event/i.test(
              `${table.name} ${table.description}`,
            ),
        }));
      this.#publish({ storyTables, error: null });
      return true;
    } catch (error) {
      if (version === this.#preparing) {
        this.#publish({ error: error as Error });
      }
      return false;
    }
  }

  setStoryTables(names: string[]): void {
    if (this.#task) {
      throw new Error("请等待地图取材完成后调整资料表");
    }
    if (names.some((name) => !this.#snapshot.storyTables.some((table) => table.name === name))) {
      throw new Error("资料表不存在");
    }
    this.#publish({
      storyTables: this.#snapshot.storyTables.map((table) => ({
        ...table,
        selected: names.includes(table.name),
      })),
    });
  }

  async request(input: {
    instruction: string;
    selectedId?: string;
    includeStory?: boolean;
    selectedPoint?: MapPoint;
  }): Promise<void> {
    if (this.#task || this.#reservation || this.#saving) {
      throw new Error("请等待当前地图任务完成");
    }
    if (!input.instruction.trim()) {
      throw new Error("请输入地图指令");
    }
    const reservation = {};
    // 空间查询前即占用入口并固定会话，双击或切换聊天都不能把旧指令带入新目标。
    const session = this.#session;
    const chatId = this.#chatId;
    const binding = this.#binding;
    this.#reservation = reservation;
    this.#publish({ status: "reading", error: null });
    const prepared = await this.prepare();
    if (
      this.#reservation !== reservation ||
      session !== this.#session ||
      chatId !== this.#chatId ||
      binding !== this.#binding
    ) {
      return;
    }
    this.#reservation = null;
    if (!prepared) {
      this.#publish({ status: "idle" });
      return;
    }
    const { scopeKey, map, proposal } = this.#snapshot;
    if (!this.#chatId || !scopeKey) {
      this.#publish({ error: new Error("请先打开聊天并连接 Memory 资料空间"), status: "idle" });
      return;
    }
    const task: Task = {
      controller: new AbortController(),
      session: this.#session,
      chatId: this.#chatId,
      scopeKey,
    };
    this.#task = task;
    this.#publish({ status: "reading", error: null, answer: null });
    try {
      const defaultId = this.#deps.connections.getSnapshot().defaultModelConnectionId;
      if (!defaultId) {
        throw new Error("请先在设置中选择默认模型连接");
      }
      const connection = this.#deps.connections.getConnection(defaultId);
      const tables = this.#snapshot.storyTables
        .filter((table) => table.selected)
        .map((table) => table.name);
      this.#publish({ status: "generating", progress: null });
      const candidate = proposal?.map ?? map;
      const prompt = JSON.stringify({
        instruction: input.instruction.trim(),
        selectedId: input.selectedId ?? null,
        selectedPoint: input.selectedPoint ?? null,
        includeStory: !!input.includeStory,
      });
      this.#deps.logs?.info("map", "地图助手", "开始地图任务", {
        prompt,
        tables: input.includeStory ? tables : [],
      });
      const turn = await generateMapTurn({
        transport: this.#deps.transport,
        connection,
        prompt,
        signal: task.controller.signal,
        saved: map,
        candidate,
        story: input.includeStory
          ? (signal) => createMapStoryReader(this.#deps.data, tables, signal, task.scopeKey)
          : undefined,
        progress: (progress) => {
          if (this.#owns(task)) {
            this.#publish({ progress });
          }
        },
        trace: (event) => {
          if (event.type !== "request" && event.type !== "assistant") {
            this.#deps.logs?.info("map", "地图助手", event.type, event);
          }
        },
      });
      if (!this.#owns(task)) {
        return;
      }
      const currentSchema = await this.#deps.data.describe(mapScope(this.#deps.data));
      if (!this.#owns(task)) {
        return;
      }
      if (stableMapKey(currentSchema) !== task.scopeKey) {
        throw new Error("生成期间稳定资料空间已变化，地图提案已丢弃");
      }
      if (turn.type === "query") {
        const { reply } = turn;
        this.#publish({
          answer: reply.summary,
          highlightIds: [...reply.featureIds, ...reply.routeRoadIds],
          status: "idle",
        });
      } else {
        const next = turn.proposal;
        this.#publish({ proposal: next, highlightIds: next.affectedIds, status: "idle" });
      }
    } catch (error) {
      if (this.#owns(task)) {
        this.#publish({ error: error as Error, status: "idle" });
      }
    } finally {
      if (this.#task === task) {
        this.#task = null;
      }
    }
  }

  async apply(): Promise<void> {
    const { proposal, map } = this.#snapshot;
    if (!proposal) {
      throw new Error("没有待应用的地图提案");
    }
    if (proposal.baseRevision !== map.revision) {
      throw new Error("地图版本已变化，请重新生成提案");
    }
    await this.#save(proposal.map, map);
  }
  async undo(): Promise<void> {
    if (!this.#undo) {
      throw new Error("没有可撤销的地图修改");
    }
    await this.#save({ ...this.#undo, revision: this.#snapshot.map.revision + 1 }, null);
  }
  discard(): void {
    if (this.#snapshot.status === "saving") {
      throw new Error("地图正在保存，请等待完成");
    }
    this.cancel();
    this.#publish({ proposal: null, answer: null, highlightIds: [] });
  }
  cancel(): void {
    ++this.#preparing;
    this.#session = {};
    this.#task?.controller.abort();
    this.#task = null;
    this.#reservation = null;
    // 已提交的保存属于原聊天，等待其完成；退出只使结果失去当前界面归属。
    if (this.#snapshot.status !== "saving") {
      this.#publish({ status: "idle" });
    }
  }
  dispose(): void {
    this.cancel();
    this.#unsubscribe.forEach((unsubscribe) => unsubscribe());
    this.#listeners.clear();
  }

  async #save(map: MapDocument, undo: MapDocument | null): Promise<void> {
    if (this.#task || this.#reservation || this.#saving) {
      throw new Error("请等待当前地图任务完成");
    }
    const chatId = this.#chatId;
    const { scopeKey } = this.#snapshot;
    if (!chatId || !scopeKey) {
      throw new Error("当前地图没有聊天与资料空间归属");
    }
    const session = this.#session;
    const binding = this.#binding;
    const data: MapData = { version: 1, maps: { ...this.#data.maps, [scopeKey]: map } };
    this.#saving = true;
    this.#publish({ status: "saving", error: null });
    try {
      const schema = await this.#deps.data.describe(mapScope(this.#deps.data));
      if (
        session !== this.#session ||
        chatId !== this.#chatId ||
        binding !== this.#binding ||
        stableMapKey(schema) !== scopeKey
      ) {
        throw new Error("地图归属已变化，未提交保存");
      }
      await this.#deps.storage.write(chatId, data);
      if (
        session !== this.#session ||
        chatId !== this.#chatId ||
        scopeKey !== this.#snapshot.scopeKey
      ) {
        return;
      }
      this.#data = data;
      this.#undo = undo;
      this.#publish({
        map,
        proposal: null,
        highlightIds: [],
        answer: null,
        canUndo: undo !== null,
        status: "idle",
      });
    } catch (error) {
      if (session === this.#session) {
        this.#publish({ status: "idle", error: error as Error });
      }
    } finally {
      this.#saving = false;
      if (session !== this.#session) {
        // 保存可以在退出后确认；即使已切出再切回，也重读原生存储，避免展示旧缓存。
        this.#data = this.#chatId
          ? (this.#deps.storage.read(this.#chatId) ?? { version: 1, maps: {} })
          : { version: 1, maps: {} };
        this.#publish({
          status: "idle",
          proposal: null,
          map: this.#snapshot.scopeKey
            ? (this.#data.maps[this.#snapshot.scopeKey] ?? emptyMap())
            : emptyMap(),
        });
      }
    }
  }
  #owns(task: Task): boolean {
    return (
      this.#task === task &&
      !task.controller.signal.aborted &&
      task.session === this.#session &&
      task.chatId === this.#chatId &&
      task.scopeKey === this.#snapshot.scopeKey
    );
  }
  #sourceBinding(): string {
    const source = this.#deps.data.getSnapshot();
    return JSON.stringify([
      source.sourceId,
      source.context.sourceName,
      source.context.chatIdentity,
      source.context.scopeId,
    ]);
  }
  #changed = (): void => {
    const chatId = this.#deps.chat.getSnapshot()?.id ?? null;
    const binding = this.#sourceBinding();
    if (chatId === this.#chatId && binding === this.#binding) {
      return;
    }
    this.cancel();
    this.#undo = null;
    this.#chatId = chatId;
    this.#binding = binding;
    this.#data = chatId
      ? (this.#deps.storage.read(chatId) ?? { version: 1, maps: {} })
      : { version: 1, maps: {} };
    const entry = Object.entries(this.#data.maps).at(-1);
    this.#publish({
      chatId,
      map: entry?.[1] ?? emptyMap(),
      scopeKey: entry?.[0] ?? null,
      proposal: null,
      error: null,
      answer: null,
      highlightIds: [],
      canUndo: false,
      storyTables: [],
      status: this.#saving ? "saving" : "idle",
    });
    void this.prepare();
  };
  #publish(patch: Partial<MapSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#listeners.forEach((listener) => listener());
  }
}
