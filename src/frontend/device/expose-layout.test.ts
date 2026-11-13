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

test("Material 3 cards and swipe navigation share the carousel layout", () => {
  const screen = { width: 402, height: 874, bottom: 34, status: 62 };
  const layout = createExposeLayout(screen, "material3");
  const current = placeExposeCard(layout, 1, 1, 0);
  const adjacent = placeExposeCard(layout, 2, 1, 0);
  assert.equal(layout.arrangement, "carousel");
  assert.equal(adjacent.left, current.left + layout.stride);
  assert.equal(adjacent.width, current.width);
  assert.equal(exposeSwipeSteps(layout, -layout.stride, -5), 1);
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

test("modern selected cards stay horizontally centered on both devices and short screens", () => {
  for (const screen of [
    { width: 402, height: 874, bottom: 34, status: 62 },
    { width: 375, height: 667, bottom: 0, status: 20 },
    { width: 320, height: 568, bottom: 44, status: 62 },
  ]) {
    const layout = createExposeLayout(screen, "ios26");
    const selected = placeExposeCard(layout, 0, 0, 0);
    assert.ok(Math.abs(selected.left + selected.width / 2 - screen.width / 2) < 0.001);
  }
});

test("modern rear cards inset both vertical edges as their depth increases", () => {
  const layout = createExposeLayout({ width: 402, height: 874, bottom: 34, status: 62 }, "ios26");
  const selected = placeExposeCard(layout, 0, 0, 0);
  let previous = selected;
  // Include fractional depth: dragging must preserve the same vertical center as settled cards.
  for (const depth of [0.5, 1, 2, 3]) {
    const rear = placeExposeCard(layout, 0, 0, -depth * layout.stride);
    assert.ok(rear.top > previous.top);
    assert.ok(rear.top + rear.height < previous.top + previous.height);
    assert.ok(Math.abs(rear.top + rear.height / 2 - selected.top - selected.height / 2) < 0.001);
    previous = rear;
  }
});

test("modern nearest rear cards keep their left corners and headers inside the display", () => {
  for (const screen of [
    { width: 402, height: 874, bottom: 34, status: 62 },
    { width: 375, height: 667, bottom: 0, status: 20 },
    { width: 320, height: 568, bottom: 44, status: 62 },
  ]) {
    const layout = createExposeLayout(screen, "ios26");
    const selected = placeExposeCard(layout, 0, 0, 0);
    const rear = placeExposeCard(layout, 1, 0, 0);
    assert.ok(rear.left > 0, "The nearest rear card's rounded left edge must remain on screen");
    assert.ok(rear.left < selected.left, "The selected card must leave the rear card visible");
    assert.ok(rear.left + rear.width > selected.left, "Cards must still overlap");
  }
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
