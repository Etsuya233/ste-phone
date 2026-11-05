import assert from "node:assert/strict";
import test from "node:test";
import { emptyMap, validateMap, type MapFeature, type MapReply } from "./map.ts";
import { describeMapProposal, stageMapChanges, parseMapReply } from "./map-protocol.ts";
import { findMapRoute, validateMapQuery } from "./map-query.ts";
const place = (id: string, geometry: MapFeature["geometry"] = [[0, 0]]): MapFeature => ({
  id,
  kind: "place",
  name: id,
  aliases: [],
  description: "",
  source: "用户指令",
  memoryId: null,
  geometry,
  terrain: "land",
  connects: [],
});
const change = (features: MapFeature[]): Extract<MapReply, { type: "proposal" }> => ({
  type: "proposal",
  title: "地图",
  summary: "修改",
  upsert: features,
  remove: [],
  events: [],
});
test("partial geometry changes preserve unrelated features and historical events", () => {
  const a = place("a"),
    b = place("b");
  const map = {
    ...emptyMap(),
    features: [a, b],
    events: [
      {
        id: "event",
        title: "未知时刻的事件",
        placeIds: ["a"],
        storyTime: null,
        description: "",
        source: "资料事件/e",
      },
    ],
  };
  const draft = stageMapChanges(map, map, change([{ ...b, name: "新名称" }]));
  validateMap(draft);
  const next = describeMapProposal(map, draft, "新名称");
  assert.deepEqual(
    next.map.features.find((f) => f.id === "a"),
    a,
  );
  assert.deepEqual(next.map.events, map.events);
  assert.deepEqual(next.affectedIds, ["b"]);
  assert.equal(next.map.revision, 1);
});
test("unknown locations remain searchable records without invented coordinates", () => {
  const map = { ...emptyMap(), features: [place("pending", null)] };
  validateMap(map);
  assert.equal(map.features[0]!.geometry, null);
  assert.throws(
    () => validateMap({ ...map, features: [{ ...map.features[0]!, kind: "road" }] }),
    /位置待定/,
  );
});
test("duplicate identity, nonfinite geometry, dangling events and source identity replacement are rejected as a batch", () => {
  const a = { ...place("a"), memoryId: "memory-a" };
  const map = { ...emptyMap(), features: [a] };
  assert.throws(() => stageMapChanges(map, map, change([{ ...a, memoryId: "other" }])), /身份冲突/);
  assert.throws(() => validateMap({ ...map, features: [a, { ...a, id: "b" }] }), /身份重复/);
  assert.throws(
    () => validateMap(stageMapChanges(map, map, change([place("b", [[Infinity, 2]])]))),
    /几何无效/,
  );
  assert.throws(
    () =>
      validateMap({
        ...map,
        events: [
          {
            id: "e",
            title: "标题",
            placeIds: ["missing"],
            storyTime: null,
            description: "",
            source: "资料",
          },
        ],
      }),
    /事件/,
  );
});
test("query cannot smuggle edits or traverse disconnected or unregistered roads", () => {
  assert.throws(
    () =>
      parseMapReply(
        JSON.stringify({
          type: "query",
          summary: "查询",
          featureIds: [],
          routeRoadIds: [],
          upsert: [],
        }),
      ),
    /混合/,
  );
  const road = (id: string, from: string, to: string): MapFeature => ({
    ...place(id, [
      [id === "cd" ? 3 : 0, 0],
      [id === "cd" ? 4 : 1, 1],
    ]),
    kind: "road",
    connects: [from, to],
  });
  const map = {
    ...emptyMap(),
    features: [
      place("a"),
      place("b"),
      place("c"),
      place("d"),
      road("ab", "a", "b"),
      road("bc", "b", "c"),
      road("cd", "c", "d"),
    ],
  };
  validateMapQuery(map, {
    type: "query",
    summary: "路线",
    featureIds: ["a", "c"],
    routeRoadIds: ["ab", "bc"],
  });
  assert.throws(
    () =>
      validateMapQuery(map, {
        type: "query",
        summary: "路线",
        featureIds: ["a", "d"],
        routeRoadIds: ["ab", "cd"],
      }),
    /不连通/,
  );
  assert.throws(
    () =>
      validateMapQuery(map, {
        type: "query",
        summary: "路线",
        featureIds: ["a", "d"],
        routeRoadIds: ["missing"],
      }),
    /无法通行/,
  );
});

test("route queries turn at planar junctions without connects and distinguish bridge crossings", () => {
  const main: MapFeature = {
    ...place("main", [
      [10, 0],
      [10, 20],
    ]),
    kind: "road",
  };
  const side: MapFeature = {
    ...place("side", [
      [0, 10],
      [10, 10],
    ]),
    kind: "road",
  };
  const map = { ...emptyMap(), features: [main, side] };
  const routeRoadIds = findMapRoute(map, "main", "side");
  assert.deepEqual(routeRoadIds, ["main", "side"]);
  const reply = {
    type: "query",
    summary: "路线",
    featureIds: ["main", "side"],
    routeRoadIds,
  } as const;
  validateMapQuery(map, { ...reply, featureIds: [...reply.featureIds] });

  const overpass = { ...main, roadClass: "bridge" } as const;
  const elevated = { ...map, features: [overpass, side] };
  assert.deepEqual(findMapRoute(elevated, "main", "side"), []);
  assert.throws(
    () => validateMapQuery(elevated, { ...reply, featureIds: [...reply.featureIds] }),
    /不连通/,
  );

  const bridgehead = {
    ...overpass,
    geometry: [
      [10, 0],
      [10, 10],
    ] as MapFeature["geometry"],
  };
  assert.deepEqual(findMapRoute({ ...map, features: [bridgehead, side] }, "main", "side"), [
    "main",
    "side",
  ]);
});

test("region parent types and ancestry cycles reject the entire map", () => {
  const region = (id: string, parentId: string): MapFeature => ({
    ...place(id, [
      [0, 0],
      [2, 0],
      [2, 2],
    ]),
    kind: "region",
    parentId,
  });
  assert.throws(
    () => validateMap({ ...emptyMap(), features: [region("a", "b"), region("b", "a")] }),
    /环路/,
  );
  assert.throws(
    () =>
      validateMap({
        ...emptyMap(),
        features: [{ ...place("a"), parentId: 1 as unknown as string }],
      }),
    /字段/,
  );
});
