import assert from "node:assert/strict";
import test from "node:test";
import { emptyMap, type MapFeature } from "./map.ts";
import { placeFeatures, regionFeatures } from "./ui/map-ol-features.ts";
import { previousGeometryFeatures, selectionFeatures } from "./ui/map-ol-overlays.ts";

const station: MapFeature = {
  id: "station",
  name: "车站",
  kind: "place",
  geometry: [[10, 20]],
  aliases: [],
  description: "",
  source: "用户指令",
  memoryId: null,
  terrain: "land",
  connects: [],
};

test("empty and unknown-location maps create no fabricated geometry", () => {
  const document = { ...emptyMap(), features: [{ ...station, geometry: null }] };
  assert.deepEqual(placeFeatures(document), []);
  assert.deepEqual(regionFeatures(document), { terrain: [], district: [], building: [] });
  assert.deepEqual(selectionFeatures(document.features, "station", ["station"], null), []);
});

test("proposal move and deletion preserve old geometry without mutating saved coordinates", () => {
  const moved: MapFeature = { ...station, geometry: [[90, 70]] };
  const before = structuredClone(station);
  const overlays = previousGeometryFeatures([station], [moved]);
  assert.equal(overlays.length, 2);
  assert.deepEqual(overlays[0]!.getGeometry()!.getExtent(), [10, 20, 10, 20]);
  assert.deepEqual(overlays[1]!.getGeometry()!.getExtent(), [10, 20, 90, 70]);
  overlays[0]!.getGeometry()!.translate(100, 100);
  assert.deepEqual(station, before);
  const deleted = previousGeometryFeatures([station], []);
  assert.equal(deleted.length, 1);
  assert.deepEqual(deleted[0]!.getGeometry()!.getExtent(), [10, 20, 10, 20]);
});

test("semantic IDs remain on map features while selection markers stay non-semantic", () => {
  const document = { ...emptyMap(), features: [station] };
  assert.equal(placeFeatures(document)[0]!.get("mapId"), station.id);
  const markers = selectionFeatures(document.features, station.id, [station.id], [50, 60]);
  assert.equal(markers.length, 2);
  assert.ok(markers.every((marker) => marker.get("mapId") === undefined));
  assert.deepEqual(markers[1]!.getGeometry()!.getExtent(), [50, 60, 50, 60]);
});
