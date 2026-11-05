import assert from "node:assert/strict";
import test from "node:test";
import { createExposeLayout, exposeSwipeSteps, placeExposeCard } from "./expose-layout.ts";

test("modern swipes snap by distance, with up to one extra card from release momentum", () => {
  const layout = createExposeLayout({ width: 402, height: 874, bottom: 34, status: 62 }, "ios26");
  assert.equal(exposeSwipeSteps(layout, 65, 0), 1);
  assert.equal(exposeSwipeSteps(layout, layout.stride * 2.1, 0), 2);
  assert.equal(exposeSwipeSteps(layout, layout.stride, 10), 2);
  assert.equal(exposeSwipeSteps(layout, -layout.stride, -10), -2);
  assert.equal(exposeSwipeSteps(layout, layout.stride, -10), 1);
});

test("classic cards retain a centered row and positive navigation direction", () => {
  const layout = createExposeLayout({ width: 375, height: 667, bottom: 0, status: 20 }, "classic");
  assert.equal(layout.direction, 1);
  const current = placeExposeCard(layout, 1, 1, 0);
  assert.equal(current.left, (375 - current.width) / 2);
  assert.equal(placeExposeCard(layout, 2, 1, 0).left - current.left, layout.stride);
});

test("modern cards overlap in history order and drag continuously into the selected position", () => {
  const layout = createExposeLayout({ width: 402, height: 874, bottom: 34, status: 62 }, "ios26");
  const selected = placeExposeCard(layout, 1, 1, 0);
  const older = placeExposeCard(layout, 2, 1, 0);
  const newer = placeExposeCard(layout, 0, 1, 0);
  assert.ok(older.left < selected.left && older.left + older.width > selected.left);
  assert.ok(newer.left < selected.left + selected.width);
  assert.ok(newer.zIndex! > selected.zIndex! && selected.zIndex! > older.zIndex!);
  const dragged = placeExposeCard(layout, 2, 1, layout.stride);
  const settled = placeExposeCard(layout, 2, 2, 0);
  assert.deepEqual(dragged, settled);
});

test("modern previews and their headers fit short screens with either device's safe area", () => {
  for (const screen of [
    { width: 320, height: 568, bottom: 44, status: 62 },
    { width: 375, height: 667, bottom: 0, status: 20 },
  ]) {
    const layout = createExposeLayout(screen, "ios26");
    assert.ok(layout.top - 44 >= screen.status);
    assert.ok(layout.top + layout.height <= screen.height - screen.bottom);
  }
});
