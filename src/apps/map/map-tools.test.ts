import assert from "node:assert/strict";
import test from "node:test";
import { createStAiTransport } from "../../infrastructure/host/ai-transport.ts";
import { generateMapTurn, type MapAgentTrace } from "./map-generation.ts";
import { emptyMap, type MapFeature } from "./map.ts";

const connection = {
  id: "test",
  name: "test",
  model: "test",
  baseUrl: "http://localhost/v1",
  apiKey: "",
  customHeaders: {},
};
const point = (id: string, memoryId: string | null = null): MapFeature => ({
  id,
  kind: "place",
  name: id,
  aliases: [],
  description: "",
  source: "用户指令",
  memoryId,
  geometry: [[1, 2]],
  terrain: "land",
  connects: [],
});
const operation = (name: string, args: unknown) => ({ name, args });
const patch = (upsert: MapFeature[], remove: string[] = []) =>
  operation("map_apply", { title: "地图", upsert, remove, events: [] });
const check = operation("map_check", {});
const finish = { type: "proposal", summary: "已修改地图" };
type Answer = ReturnType<typeof operation>[] | Record<string, unknown>;

function sse(answer: Answer, round: number) {
  const delta = Array.isArray(answer)
    ? {
        tool_calls: answer.map(({ name, args }, index) => ({
          index,
          id: `call-${round}-${index}`,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        })),
      }
    : { content: JSON.stringify(answer) };
  return new Response(
    [
      { choices: [{ delta, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: Array.isArray(answer) ? "tool_calls" : "stop" }] },
    ]
      .map((value) => `data: ${JSON.stringify(value)}\n\n`)
      .join("") + "data: [DONE]\n\n",
  );
}
function fixture(
  next: (round: number) => Answer,
  saved = emptyMap(),
  story?: Parameters<typeof generateMapTurn>[0]["story"],
) {
  const controller = new AbortController();
  const trace: MapAgentTrace[] = [];
  let rounds = 0;
  const run = generateMapTurn({
    transport: createStAiTransport(() => ({}), {
      log() {},
      fetchImpl: async () => sse(next(++rounds), rounds),
    }),
    connection,
    prompt: { role: "user", content: "地图测试", timestamp: 0 },
    history: [],
    recordMessages() {},
    signal: controller.signal,
    saved,
    candidate: saved,
    story,
    trace: (event) => trace.push(event),
  });
  return { run, trace, controller, rounds: () => rounds };
}
const results = (trace: MapAgentTrace[]) => trace.filter((event) => event.type === "tool_result");

test("native sequential tools repair broken references and only expose a checked proposal", async () => {
  const base = { ...emptyMap(), features: [point("a")] };
  const road: MapFeature = {
    ...point("r"),
    kind: "road",
    geometry: [
      [1, 2],
      [4, 4],
    ],
    connects: ["a", "b"],
  };
  const f = fixture(
    (round) => [[patch([road]), check], [patch([point("b")]), check], finish][round - 1]!,
    base,
  );
  const turn = await f.run;
  assert.equal(turn.type, "proposal");
  assert.deepEqual(
    results(f.trace).map((result) => result.failed),
    [false, true, false, false],
  );
  assert.match(JSON.stringify(results(f.trace)[1]), /道路地点关联无效/);
  assert.deepEqual(base.features, [point("a")]);
});
test("checking once does not authorize a later draft change", async () => {
  const f = fixture(
    (round) => [[patch([point("a")]), check], [patch([point("b")])], finish][round - 1]!,
  );
  await assert.rejects(f.run, /未完成草稿检查/);
});
test("remove and re-add cannot change a stable source binding, even to a known ID", async () => {
  const base = { ...emptyMap(), features: [point("a", "memory-a"), point("b", "memory-b")] };
  const f = fixture(
    (round) => [[patch([], ["a"]), patch([point("a", "memory-b")]), check], finish][round - 1]!,
    base,
  );
  const turn = await f.run;
  assert.equal(turn.type, "proposal");
  assert.deepEqual(
    results(f.trace).map((result) => result.failed),
    [false, true, false],
  );
  assert.match(JSON.stringify(results(f.trace)[1]), /稳定资料身份冲突/);
  if (turn.type === "proposal") {
    assert.equal(
      turn.proposal.map.features.some((feature) => feature.id === "a"),
      false,
    );
  }
});
test("query stays read-only and story tools only exist for the supplied reader", async () => {
  const base = { ...emptyMap(), features: [point("a")] };
  const f = fixture(
    (round) =>
      round === 1
        ? [operation("map_read", { query: "a" })]
        : { type: "query", summary: "找到了", featureIds: ["a"], routeRoadIds: [] },
    base,
  );
  assert.equal((await f.run).type, "query");
  const first = f.trace.find((event) => event.type === "request")!;
  assert.doesNotMatch(JSON.stringify(first.tools), /map_story|visual/);
  assert.deepEqual(base.features, [point("a")]);
});
test("map keeps running beyond the old model, tool and consecutive failure limits", async () => {
  const f = fixture((round) => {
    if (round <= 6) {
      return [operation("map_read", { query: 42 })];
    }
    if (round === 7) {
      return Array.from({ length: 61 }, () => operation("map_read", {}));
    }
    if (round <= 20) {
      return [operation("map_read", {})];
    }
    return { type: "query", summary: "已检查", featureIds: [], routeRoadIds: [] };
  });
  assert.equal((await f.run).type, "query");
  assert.equal(f.rounds(), 21);
  assert.equal(results(f.trace).filter((result) => result.failed).length, 6);
  assert.equal(results(f.trace).length, 80);
});
test(
  "abort settles a hanging story read and prevents another model request",
  { timeout: 1000 },
  async () => {
    let started!: () => void;
    const reading = new Promise<void>((resolve) => {
      started = resolve;
    });
    const f = fixture(
      () => [operation("map_story_summary", {})],
      emptyMap(),
      () => ({
        memoryIds: new Set(),
        async directory() {
          return {};
        },
        async records() {
          return {};
        },
        summary() {
          started();
          return new Promise(() => {});
        },
      }),
    );
    await reading;
    f.controller.abort();
    await assert.rejects(f.run, { name: "AbortError" });
    assert.equal(f.rounds(), 1);
  },
);
test("cancelling on tool feedback prevents the next round and any proposal", async () => {
  const f = fixture(
    () => [operation("map_story_summary", {})],
    emptyMap(),
    () => ({
      memoryIds: new Set(),
      async directory() {
        return {};
      },
      async records() {
        return {};
      },
      async summary() {
        f.controller.abort();
        return {};
      },
    }),
  );
  await assert.rejects(f.run, { name: "AbortError" });
  assert.equal(f.rounds(), 1);
});
