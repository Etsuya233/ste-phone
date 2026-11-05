import assert from "node:assert/strict";
import test from "node:test";
import { MapService } from "./map-service.ts";
import { emptyMap, type MapData, type MapDocument, type MapFeature, type MapReply } from "./map.ts";
import type { DataAppPublic, DatabaseSchema, DataSourceSnapshot } from "../data-source/public.ts";
import { createStAiTransport } from "../../infrastructure/host/ai-transport.ts";

const key = JSON.stringify(["ste-memory", "scope"]);
const connection = {
  id: "model",
  name: "地图模型",
  model: "test",
  baseUrl: "http://localhost/v1",
  apiKey: "",
  customHeaders: {},
};
const place = (id: string): MapFeature => ({
  id,
  kind: "place",
  name: id,
  aliases: [],
  description: "",
  source: "用户指令",
  memoryId: null,
  geometry: [[10, 20]],
  terrain: "land",
  connects: [],
});
const proposal = (id: string): MapReply => ({
  type: "proposal",
  summary: `新增${id}`,
  title: "测试地图",
  upsert: [place(id)],
  remove: [],
  events: [],
});
const response = (value: unknown) =>
  new Response(
    `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(value) }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
  );
function tool(name: string, args: unknown) {
  const encoded = JSON.stringify(args);
  const fragments = [encoded.slice(0, 12), encoded.slice(12)];
  const chunks = fragments.map((argumentsText, index) => ({
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              ...(index === 0 ? { id: name, type: "function" } : {}),
              function: { ...(index === 0 ? { name } : {}), arguments: argumentsText },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  }));
  return new Response(
    [...chunks, { choices: [{ delta: {}, finish_reason: "tool_calls" }] }]
      .map((chunk) => "data: " + JSON.stringify(chunk) + "\n\n")
      .join("") + "data: [DONE]\n\n",
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
const flush = () => new Promise<void>((accept) => setImmediate(accept));

function fixture(initial: MapDocument = emptyMap()) {
  let selectedModel: string | null = connection.id;
  let configured = [{ ...connection }, { ...connection, id: "global", model: "global-test" }];
  const requestedModels: { model: string; custom_url: string }[] = [];
  let chatId = "a";
  let available = true;
  let stableScopeId = "scope";
  const listeners = new Set<() => void>();
  const saved = new Map<string, MapData>([
    ["a", { version: 1, maps: { [key]: structuredClone(initial) } }],
  ]);
  const prompts: { map: MapDocument; instruction: string }[] = [];
  let replyValue = proposal("one");
  let delayedReply: Promise<Response> | undefined;
  let describeGate: Promise<void> | null = null;
  let saveGate: Promise<void> | null = null;
  let failSave = false;
  let writes = 0;
  const schema: DatabaseSchema = {
    sourceId: "ste-memory",
    scopeId: "scope",
    stableScopeId: "scope",
    name: "测试",
    schemaVersion: 1,
    schemaKey: "schema",
    databaseKey: "db",
    objects: [],
  };
  const source = (): DataSourceSnapshot => ({
    sourceId: "ste-memory",
    context: {
      sourceName: "Memory",
      chatIdentity: chatId,
      chatName: chatId,
      scopeId: "scope",
      spaceName: "测试",
      available,
      message: available ? null : "资料离线",
    },
    status: "idle",
    data: null,
    stale: false,
    error: null,
    loadedAt: null,
    revision: 0,
  });
  const unused = async (): Promise<never> => {
    throw new Error("unexpected data call");
  };
  const data: DataAppPublic = {
    getSnapshot: source,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    describe: async () => {
      const gate = describeGate;
      if (gate) {
        await gate;
      }
      return { ...schema, stableScopeId };
    },
    readBackground: unused,
    readRelatedBackground: unused,
    readWorldState: unused,
    readRecentChat: unused,
    query: unused,
    readSummary: unused,
  };
  const service = new MapService({
    data,
    chat: {
      getSnapshot: () => ({ id: chatId, name: chatId }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    connections: {
      getSnapshot: () => ({ connections: configured, defaultModelConnectionId: "global" }),
      getConnection: (id) => structuredClone(configured.find((entry) => entry.id === id)!),
      subscribe: () => () => {},
    },
    modelPreference: {
      getSnapshot: () => selectedModel,
      subscribe: () => () => {},
      select: (id) => {
        selectedModel = id;
      },
    },
    transport: createStAiTransport(() => ({}), {
      log() {},
      fetchImpl: (async (_url, init) => {
        const body = JSON.parse(init!.body as string) as {
          messages: { role: string; content: string }[];
          model: string;
          custom_url: string;
        };
        requestedModels.push({ model: body.model, custom_url: body.custom_url });
        const last = body.messages.at(-1)!;
        if (last.role === "user") {
          prompts.push(JSON.parse(last.content));
          return delayedReply ?? tool("map_read", {});
        }
        const results = body.messages.filter((message) => message.role === "tool");
        if (results.length === 1) {
          prompts.at(-1)!.map = JSON.parse(last.content).value;
          if (replyValue.type === "query") {
            return response(replyValue);
          }
          const { title, upsert, remove, events } = replyValue;
          return tool("map_apply", { title, upsert, remove, events });
        }
        if (results.length === 2) {
          return tool("map_check", {});
        }
        return response({ type: "proposal", summary: replyValue.summary });
      }) as typeof fetch,
    }),
    storage: {
      read: (id) => (saved.has(id) ? structuredClone(saved.get(id)!) : null),
      write: async (id, value) => {
        writes++;
        if (saveGate) {
          await saveGate;
        }
        if (failSave) {
          throw new Error("磁盘失败");
        }
        saved.set(id, structuredClone(value));
      },
    },
  });
  return {
    service,
    saved,
    prompts,
    requestedModels,
    unsetModel: () => {
      selectedModel = null;
    },
    removeMapModel: () => {
      configured = configured.filter((entry) => entry.id !== connection.id);
    },
    updateMapModel: () => {
      configured = configured.map((entry) =>
        entry.id === connection.id
          ? { ...entry, model: "edited", baseUrl: "https://edited.invalid/v1" }
          : entry,
      );
    },
    get writes() {
      return writes;
    },
    reply: (value: MapReply) => {
      replyValue = value;
    },
    delayReply: (promise: Promise<Response>) => {
      delayedReply = promise;
    },
    delayDescribe: (promise: Promise<void> | null) => {
      describeGate = promise;
    },
    replaceStableScope: () => {
      stableScopeId = "replacement";
    },
    delaySave: (promise: Promise<void>) => {
      saveGate = promise;
    },
    failSave: (value: boolean) => {
      failSave = value;
    },
    offline: () => {
      available = false;
      listeners.forEach((listener) => listener());
    },
    switchChat: (id: string) => {
      chatId = id;
      listeners.forEach((listener) => listener());
    },
  };
}

test("map requests are mutually exclusive even while preparing scope", async () => {
  const f = fixture();
  const gate = deferred<void>();
  f.delayDescribe(gate.promise);
  const first = f.service.request({ instruction: "新增地点一" });
  await assert.rejects(f.service.request({ instruction: "新增地点二" }), /等待|任务/);
  gate.resolve();
  await first;
  assert.equal(f.prompts.length, 1);
  f.service.dispose();
});

test("a command waiting for scope cannot migrate into another chat", async () => {
  const f = fixture();
  const gate = deferred<void>();
  f.delayDescribe(gate.promise);
  const running = f.service.request({ instruction: "旧聊天指令" });
  f.switchChat("b");
  gate.resolve();
  await running;
  await flush();
  assert.equal(f.prompts.length, 0);
  assert.equal(f.service.getSnapshot().proposal, null);
  assert.equal(f.writes, 0);
  f.service.dispose();
});

test("offline maps remain readable but generation refuses unavailable source", async () => {
  const original = { ...emptyMap(), title: "已存地图", revision: 4, features: [place("saved")] };
  const f = fixture(original);
  f.offline();
  await f.service.request({ instruction: "新增" });
  assert.deepEqual(f.service.getSnapshot().map, original);
  assert.match(f.service.getSnapshot().error!.message, /离线/);
  assert.equal(f.prompts.length, 0);
  f.service.dispose();
});

test("cancelled generation ignores a late model reply and never writes", async () => {
  const f = fixture();
  const late = deferred<Response>();
  f.delayReply(late.promise);
  const running = f.service.request({ instruction: "新增" });
  await flush();
  assert.equal(f.prompts.length, 1);
  f.service.cancel();
  late.resolve(tool("map_read", {}));
  await running;
  assert.equal(f.service.getSnapshot().proposal, null);
  assert.equal(f.service.getSnapshot().status, "idle");
  assert.equal(f.writes, 0);
  f.service.dispose();
});

test("save failure preserves the complete proposal and retries without generation", async () => {
  const f = fixture();
  await f.service.request({ instruction: "新增" });
  const candidate = f.service.getSnapshot().proposal;
  f.failSave(true);
  await f.service.apply();
  assert.equal(f.service.getSnapshot().proposal, candidate);
  assert.equal(f.service.getSnapshot().map.revision, 0);
  assert.match(f.service.getSnapshot().error!.message, /磁盘/);
  f.failSave(false);
  await f.service.apply();
  assert.equal(f.service.getSnapshot().proposal, null);
  assert.equal(f.service.getSnapshot().map.revision, 1);
  assert.equal(f.prompts.length, 1);
  assert.equal(f.writes, 2);
  f.service.dispose();
});

test("continuing a proposal retains earlier candidate changes and untouched geometry", async () => {
  const original = { ...emptyMap(), features: [place("original")] };
  const f = fixture(original);
  await f.service.request({ instruction: "新增一" });
  f.reply(proposal("two"));
  await f.service.request({ instruction: "再新增二" });
  assert.deepEqual(
    f.prompts[1]!.map.features.map((item) => item.id),
    ["original", "one"],
  );
  const snapshot = f.service.getSnapshot();
  assert.deepEqual(
    snapshot.proposal!.map.features.map((item) => item.id),
    ["original", "one", "two"],
  );
  assert.deepEqual(snapshot.proposal!.map.features[0], original.features[0]);
  assert.equal(snapshot.proposal!.baseRevision, 0);
  assert.equal(f.writes, 0);
  f.service.dispose();
});

test("applying and undoing persist monotonically increasing revisions", async () => {
  const initial = { ...emptyMap(), revision: 6, features: [place("old")] };
  const f = fixture(initial);
  await f.service.request({ instruction: "新增" });
  await f.service.apply();
  assert.equal(f.saved.get("a")!.maps[key]!.revision, 7);
  assert.equal(f.service.getSnapshot().canUndo, true);
  await f.service.undo();
  assert.deepEqual(f.saved.get("a")!.maps[key], { ...initial, revision: 8 });
  assert.equal(f.service.getSnapshot().canUndo, false);
  f.service.dispose();
});

test("returning to the same chat during save reloads its confirmed persisted result", async () => {
  const f = fixture();
  await f.service.request({ instruction: "新增" });
  const gate = deferred<void>();
  f.delaySave(gate.promise);
  const saving = f.service.apply();
  await flush();
  assert.equal(f.writes, 1);
  f.switchChat("b");
  await flush();
  f.switchChat("a");
  await flush();
  gate.resolve();
  await saving;
  assert.equal(f.service.getSnapshot().status, "idle");
  assert.equal(f.service.getSnapshot().map.revision, 1);
  assert.deepEqual(f.service.getSnapshot().map, f.saved.get("a")!.maps[key]);
  assert.equal(f.service.getSnapshot().proposal, null);
  f.service.dispose();
});

test("a replaced stable space in the same Memory instance cannot receive an old proposal", async () => {
  const f = fixture();
  await f.service.request({ instruction: "新增" });
  f.replaceStableScope();
  await f.service.apply();
  assert.match(f.service.getSnapshot().error!.message, /空间|变化|归属/);
  assert.equal(f.writes, 0);
  assert.equal(f.saved.get("a")!.maps[key]!.revision, 0);
  f.service.dispose();
});

test("a generation finishing after same-instance stable scope replacement is discarded", async () => {
  const f = fixture();
  const late = deferred<Response>();
  f.delayReply(late.promise);
  const running = f.service.request({ instruction: "新增" });
  await flush();
  f.replaceStableScope();
  late.resolve(tool("map_read", {}));
  await running;
  assert.equal(f.service.getSnapshot().proposal, null);
  assert.match(f.service.getSnapshot().error!.message, /稳定资料空间已变化/);
  assert.equal(f.writes, 0);
  f.service.dispose();
});

test("map refuses to request an unselected or deleted connection even with a global default", async () => {
  const f = fixture();
  f.unsetModel();
  await f.service.request({ instruction: "新增地点" });
  assert.match(f.service.getSnapshot().error!.message, /选择模型连接/);
  f.service.selectModel(connection.id);
  f.removeMapModel();
  await f.service.request({ instruction: "新增地点" });
  assert.match(f.service.getSnapshot().error!.message, /已删除/);
  assert.deepEqual(f.requestedModels, []);
  f.service.dispose();
});

test("map holds the chosen connection before async preparation and through every tool round", async () => {
  const f = fixture();
  const gate = deferred<void>();
  f.delayDescribe(gate.promise);
  const running = f.service.request({ instruction: "新增地点" });
  assert.throws(() => f.service.selectModel("global"), /当前地图任务/);
  f.updateMapModel();
  gate.resolve();
  await running;
  assert.equal(f.requestedModels.length, 4);
  assert.deepEqual(
    f.requestedModels,
    Array.from({ length: 4 }, () => ({ model: connection.model, custom_url: connection.baseUrl })),
  );
  await f.service.request({ instruction: "继续调整" });
  assert.deepEqual(
    f.requestedModels.slice(4),
    Array.from({ length: 4 }, () => ({ model: "edited", custom_url: "https://edited.invalid/v1" })),
  );
  f.service.dispose();
});
