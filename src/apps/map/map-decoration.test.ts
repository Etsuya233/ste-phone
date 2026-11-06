import assert from "node:assert/strict";
import test from "node:test";
import { emptyMap, readMapData, validateMap, type MapFeature } from "./map.ts";
import { generateMapDecoration, roadClearance } from "./map-decoration.ts";
import {
  pointInPolygon,
  polygonsOverlap,
  polygonEdgesCross,
  segmentDistance,
} from "./map-geometry.ts";
const region = (id: string, x = 0): MapFeature => ({
  id,
  kind: "region",
  name: id,
  aliases: [],
  description: "示意街区",
  source: "用户指定制图补充",
  memoryId: null,
  geometry: [
    [x, 0],
    [x + 200, 0],
    [x + 200, 200],
    [x, 200],
  ],
  terrain: "land",
  connects: [],
  cartography: { layer: "district", density: "dense", buildingSize: 9, seed: "stable" },
});

test("old v1 geometry remains readable without cartography and invalid new fields fail strictly", () => {
  const old = region("old");
  delete old.cartography;
  assert.deepEqual(
    readMapData({ version: 1, maps: { scope: { ...emptyMap(), features: [old] } } }).maps.scope!
      .features,
    [old],
  );
  const invalid = [
    { layer: "district", density: "infinite" },
    { layer: "building", density: "dense" },
    { layer: "district", buildingSize: NaN },
    { layer: "district", seed: "" },
    { layer: "district", unknown: 1 },
  ];
  for (const style of invalid) {
    assert.throws(() =>
      validateMap({
        ...emptyMap(),
        features: [{ ...region("bad"), cartography: style as MapFeature["cartography"] }],
      }),
    );
  }
  assert.throws(
    () => validateMap({ ...emptyMap(), features: [{ ...region("water"), terrain: "water" }] }),
    /不一致/,
  );
  assert.throws(
    () => validateMap({ ...emptyMap(), features: [{ ...region("road"), roadClass: "arterial" }] }),
    /道路等级/,
  );
});
test("decoration is repeatable, region-local and unaffected by distant additions or edits", () => {
  const a = region("a"),
    b = region("b", 1000);
  const first = generateMapDecoration([a, b]);
  assert.ok(first.buildings.length > 50);
  assert.deepEqual(generateMapDecoration(structuredClone([a, b])), first);
  const changed = generateMapDecoration([
    a,
    { ...b, cartography: { ...b.cartography!, seed: "changed" } },
    region("far", 3000),
  ]);
  const oldA = first.buildings.filter((f) => f.ownerId === "a"),
    newA = changed.buildings.filter((f) => f.ownerId === "a");
  assert.deepEqual(newA, oldA);
  assert.equal(newA[0], oldA[0]);
  const oldB = first.buildings.filter((f) => f.ownerId === "b"),
    newB = changed.buildings.filter((f) => f.ownerId === "b");
  assert.notDeepEqual(newB, oldB);
});
test("building footprints obey concave owner boundaries and avoid water, roads and landmarks", () => {
  const owner = region("owner");
  owner.geometry = [
    [0, 0],
    [200, 0],
    [200, 200],
    [120, 200],
    [120, 80],
    [80, 80],
    [80, 200],
    [0, 200],
  ];
  const water: MapFeature = {
    ...region("water"),
    geometry: [
      [0, 0],
      [35, 0],
      [35, 200],
      [0, 200],
    ],
    terrain: "water",
    cartography: { layer: "terrain" },
  };
  const road: MapFeature = {
    ...region("road"),
    kind: "road",
    geometry: [
      [0, 45],
      [200, 45],
    ],
    roadClass: "arterial",
    cartography: undefined,
  };
  const landmark: MapFeature = {
    ...region("place"),
    kind: "place",
    geometry: [[160, 140]],
    cartography: undefined,
  };
  const features = [owner, water, road, landmark];
  const decoration = generateMapDecoration(features);
  assert.ok(decoration.buildings.length > 5);
  for (const building of decoration.buildings) {
    assert.ok(building.geometry.every((p) => pointInPolygon(p, owner.geometry!)));
    assert.equal(polygonEdgesCross(building.geometry, owner.geometry!), false);
    assert.equal(polygonsOverlap(building.geometry, water.geometry!), false);
    assert.ok(
      building.geometry.every(
        (p) => segmentDistance(p, road.geometry![0]!, road.geometry![1]!) >= roadClearance.arterial,
      ),
    );
    assert.ok(!pointInPolygon(landmark.geometry![0]!, building.geometry));
  }
});
test("decorative sampling is bounded and never changes the story features", () => {
  const owner = region("large");
  owner.geometry = [
    [0, 0],
    [10000, 0],
    [10000, 10000],
    [0, 10000],
  ];
  owner.cartography!.buildingSize = 2;
  const before = structuredClone(owner);
  const decoration = generateMapDecoration([owner]);
  assert.ok(decoration.buildings.length <= 1100);
  assert.deepEqual(owner, before);
  const forest = {
    ...region("forest"),
    terrain: "park" as const,
    cartography: { layer: "terrain" as const, landuse: "forest" as const },
  };
  assert.ok(generateMapDecoration([forest]).trees.length > 0);
  assert.equal(generateMapDecoration([forest]).buildings.length, 0);
});

test("parent district decoration yields to explicit child districts and park land", () => {
  const parent = region("parent");
  const child = {
    ...region("child"),
    parentId: "parent",
    geometry: [
      [0, 0],
      [100, 0],
      [100, 200],
      [0, 200],
    ] as [number, number][],
  };
  const park = {
    ...region("park"),
    terrain: "park" as const,
    geometry: [
      [100, 0],
      [200, 0],
      [200, 70],
      [100, 70],
    ] as [number, number][],
    cartography: { layer: "terrain" as const },
  };
  const decoration = generateMapDecoration([parent, child, park]);
  const parentBuildings = decoration.buildings.filter((f) => f.ownerId === "parent");
  assert.ok(parentBuildings.length > 0);
  for (const building of parentBuildings) {
    assert.equal(polygonsOverlap(building.geometry, child.geometry), false);
    assert.equal(polygonsOverlap(building.geometry, park.geometry), false);
  }
  assert.ok(decoration.buildings.some((f) => f.ownerId === "child"));
});
