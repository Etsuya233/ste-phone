import type { UserMessage } from "@earendil-works/pi-ai";
import type { AiTransport } from "../../core/ai/public.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type {
  MapModelPreference,
  ModelConnectionsReader,
  ModelConnectionSnapshot,
} from "../settings/public.ts";
import {
  emptyMap,
  type MapAgentStep,
  type MapConversationStorage,
  type MapConversationTurn,
  type MapData,
  type MapDocument,
  type MapSnapshot,
  type MapStorage,
  type MapPoint,
  type MapToolStep,
} from "./map.ts";
import { mapScope, stableMapKey } from "./map-context.ts";
import { generateMapTurn, type MapAgentTrace } from "./map-generation.ts";
import { createMapStoryReader } from "./map-tool-story.ts";
import type { PhoneLog } from "../logs/public.ts";

interface Dependencies {
  storage: MapStorage;
  conversations: MapConversationStorage;
  data: DataAppPublic;
  chat: ChatContext;
  connections: ModelConnectionsReader;
  modelPreference: MapModelPreference;
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
  #conversationScope: string | null = null;
  #stepId = 0;
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
      conversation: [],
      highlightIds: [],
      canUndo: false,
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
      if (scopeKey !== this.#snapshot.scopeKey || this.#conversationScope !== scopeKey) {
        if (this.#task) {
          this.cancel();
        }
        const conversation = this.#chatId
          ? this.#deps.conversations.read(this.#chatId, scopeKey)
          : [];
        this.#conversationScope = scopeKey;
        this.#undo = null;
        this.#publish({
          map: this.#data.maps[scopeKey] ?? emptyMap(),
          scopeKey,
          canUndo: false,
          proposal: null,
          error: null,
          conversation,
          highlightIds: [],
        });
      } else {
        this.#publish({ error: null });
      }
      return true;
    } catch (error) {
      if (version === this.#preparing) {
        this.#publish({ error: error as Error });
      }
      return false;
    }
  }

  selectModel(id: string): void {
    if (this.#task || this.#reservation || this.#saving) {
      throw new Error("请等待当前地图任务完成后再切换模型");
    }
    this.#deps.modelPreference.select(id);
  }

  async request(input: {
    instruction: string;
    selectedId?: string;
    selectedPoint?: MapPoint;
  }): Promise<void> {
    if (this.#task || this.#reservation || this.#saving) {
      throw new Error("请等待当前地图任务完成");
    }
    if (!input.instruction.trim()) {
      throw new Error("请输入地图指令");
    }
    const connectionId = this.#deps.modelPreference.getSnapshot();
    if (!connectionId) {
      this.#publish({ error: new Error("请先在地图助手中选择模型连接") });
      return;
    }
    if (!this.#deps.connections.getSnapshot().connections.some(({ id }) => id === connectionId)) {
      this.#publish({ error: new Error("地图选择的模型连接已删除，请重新选择") });
      return;
    }
    // 在异步取材前固定配置副本。此后设置中的编辑和删除仅影响后续任务。
    const connection: ModelConnectionSnapshot = this.#deps.connections.getConnection(connectionId);
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
    const { scopeKey, map, proposal, conversation } = this.#snapshot;
    const history = conversation.flatMap((turn) => turn.messages);
    const instruction = input.instruction.trim();
    const content = JSON.stringify({
      instruction,
      selectedId: input.selectedId ?? null,
      selectedPoint: input.selectedPoint ?? null,
    });
    const prompt: UserMessage = { role: "user", content, timestamp: Date.now() };
    const turnId = this.#startTurn(instruction, prompt);
    if (!prepared) {
      this.#failTurn(turnId, this.#snapshot.error ?? new Error("读取地图资料失败"));
      this.#publish({ status: "idle", error: null });
      this.#persistConversation();
      return;
    }
    if (!this.#chatId || !scopeKey) {
      this.#failTurn(turnId, new Error("请先打开聊天并连接 Memory 资料空间"));
      this.#publish({ status: "idle" });
      return;
    }
    const task: Task = {
      controller: new AbortController(),
      session: this.#session,
      chatId: this.#chatId,
      scopeKey,
    };
    this.#task = task;
    this.#publish({ status: "reading", error: null });
    this.#persistConversation();
    let messages: MapConversationTurn["messages"] = [prompt];
    try {
      this.#publish({ status: "generating", progress: null });
      const candidate = proposal?.map ?? map;
      this.#deps.logs?.info("map", "地图助手", "开始地图任务", { prompt: content });
      const turn = await generateMapTurn({
        transport: this.#deps.transport,
        connection,
        prompt,
        history,
        recordMessages: (transcript) => {
          messages = transcript;
        },
        signal: task.controller.signal,
        saved: map,
        candidate,
        story: (signal) => createMapStoryReader(this.#deps.data, signal, task.scopeKey),
        progress: (progress) => {
          if (this.#owns(task)) {
            this.#publish({ progress });
          }
        },
        trace: (event) => {
          if (!this.#owns(task)) {
            return;
          }
          if (event.type === "assistant") {
            this.#streamThinking(turnId, event.round, event.thinking);
            this.#appendText(turnId, event.text);
          } else if (event.type === "thinking") {
            this.#streamThinking(turnId, event.round, event.text);
          } else if (event.type === "tool_call") {
            this.#startTool(turnId, event);
          } else if (event.type === "tool_result") {
            this.#finishTool(turnId, event);
          }
          if (event.type !== "request" && event.type !== "assistant" && event.type !== "thinking") {
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
      this.#updateTurn(turnId, { messages });
      if (turn.type === "query") {
        const { reply } = turn;
        this.#completeTurn(turnId, reply.summary);
        this.#publish({
          highlightIds: [...reply.featureIds, ...reply.routeRoadIds],
          status: "idle",
        });
      } else {
        const next = turn.proposal;
        this.#completeTurn(turnId, next.summary);
        this.#publish({ proposal: next, highlightIds: next.affectedIds, status: "idle" });
      }
    } catch (error) {
      if (this.#owns(task)) {
        this.#updateTurn(turnId, { messages });
        this.#failTurn(turnId, error as Error);
        this.#publish({ status: "idle" });
      }
    } finally {
      if (this.#task === task) {
        this.#persistConversation();
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
    this.#publish({ proposal: null, highlightIds: [] });
  }
  /** 新对话保留已保存地图与撤销记录，只清空对话、待确认提案和高亮。 */
  newConversation(): boolean {
    if (this.#saving) {
      throw new Error("地图正在保存，请等待完成");
    }
    this.cancel();
    const { scopeKey } = this.#snapshot;
    try {
      if (this.#chatId && scopeKey) {
        this.#deps.conversations.write(this.#chatId, scopeKey, []);
      }
    } catch (error) {
      this.#publish({ error: new Error("无法清除本地地图对话", { cause: error }) });
      return false;
    }
    this.#publish({
      conversation: [],
      proposal: null,
      error: null,
      progress: null,
      highlightIds: [],
    });
    return true;
  }
  cancel(): void {
    ++this.#preparing;
    this.#session = {};
    this.#task?.controller.abort();
    this.#task = null;
    this.#reservation = null;
    const running = this.#snapshot.conversation.findLast((turn) => turn.status === "running");
    if (running) {
      this.#updateTurn(running.id, { status: "cancelled" });
      this.#persistConversation();
    }
    // 已提交的保存属于原聊天，等待其完成；退出只使结果失去当前界面归属。
    if (this.#snapshot.status !== "saving") {
      this.#publish({ status: "idle", progress: null });
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
  #startTurn(instruction: string, prompt: UserMessage): string {
    const turn: MapConversationTurn = {
      id: `turn-${this.#snapshot.conversation.length + 1}`,
      messages: [prompt],
      instruction,
      steps: [],
      answer: null,
      error: null,
      status: "running",
    };
    this.#publish({ conversation: [...this.#snapshot.conversation, turn] });
    return turn.id;
  }
  /** 对话被新对话或聊天切换清空后，迟到的工具事件找不到归属时直接忽略。 */
  #updateTurn(id: string, patch: Partial<MapConversationTurn>): void {
    if (!this.#snapshot.conversation.some((turn) => turn.id === id)) {
      return;
    }
    this.#publish({
      conversation: this.#snapshot.conversation.map((turn) =>
        turn.id === id ? { ...turn, ...patch } : turn,
      ),
    });
  }
  #appendStep(id: string, step: MapAgentStep): void {
    const turn = this.#snapshot.conversation.find((entry) => entry.id === id);
    if (!turn) {
      return;
    }
    this.#updateTurn(id, { steps: [...turn.steps, step] });
  }
  #streamThinking(id: string, round: number, text: string): void {
    if (!text.trim()) {
      return;
    }
    const turn = this.#snapshot.conversation.find((entry) => entry.id === id);
    if (!turn) {
      return;
    }
    const stepId = `thinking-${round}`;
    if (!turn.steps.some((step) => step.kind === "thinking" && step.id === stepId)) {
      this.#appendStep(id, { kind: "thinking", id: stepId, text });
      return;
    }
    this.#updateTurn(id, {
      steps: turn.steps.map((step) =>
        step.kind === "thinking" && step.id === stepId ? { ...step, text } : step,
      ),
    });
  }
  #appendText(id: string, text: string): void {
    if (!text.trim()) {
      return;
    }
    this.#appendStep(id, { kind: "text", id: `step-${++this.#stepId}`, text });
  }
  #startTool(id: string, event: Extract<MapAgentTrace, { type: "tool_call" }>): void {
    const step: MapToolStep = {
      kind: "tool",
      id: event.id,
      name: event.name,
      label: event.label,
      status: "running",
      input: event.args,
      output: null,
    };
    this.#appendStep(id, step);
  }
  #finishTool(id: string, event: Extract<MapAgentTrace, { type: "tool_result" }>): void {
    const turn = this.#snapshot.conversation.find((entry) => entry.id === id);
    if (!turn) {
      return;
    }
    this.#updateTurn(id, {
      steps: turn.steps.map((step) =>
        step.kind === "tool" && step.id === event.id
          ? {
              ...step,
              status: event.failed ? "failed" : "completed",
              output: event.output,
            }
          : step,
      ),
    });
  }
  #completeTurn(id: string, answer: string): void {
    this.#updateTurn(id, { answer, status: "done", error: null });
  }
  #failTurn(id: string, error: Error): void {
    this.#updateTurn(id, { status: "failed", error: error.message });
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
    this.#conversationScope = null;
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
      conversation: [],
      highlightIds: [],
      canUndo: false,
      status: this.#saving ? "saving" : "idle",
    });
    void this.prepare();
  };
  #persistConversation(): void {
    const { scopeKey, conversation } = this.#snapshot;
    if (this.#chatId && scopeKey && scopeKey === this.#conversationScope) {
      try {
        this.#deps.conversations.write(this.#chatId, scopeKey, conversation);
      } catch (error) {
        this.#publish({ error: new Error("无法保存本地地图对话", { cause: error }) });
      }
    }
  }
  #publish(patch: Partial<MapSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#listeners.forEach((listener) => listener());
  }
}
