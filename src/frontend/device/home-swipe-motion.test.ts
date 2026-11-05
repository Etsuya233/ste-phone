import assert from "node:assert/strict";
import test from "node:test";
import { HomeSwipeMotion } from "./home-swipe-motion.ts";

test("release after a brief stop ignores the earlier fast upward movement", () => {
  const motion = new HomeSwipeMotion({ x: 0, y: 0, time: 0 });
  motion.record({ x: 0, y: -100, time: 40 });
  assert.equal(motion.release({ x: 0, y: -100, time: 160 }), 0);
});

test("fast release keeps its speed after holding the starting position", () => {
  const motion = new HomeSwipeMotion({ x: 0, y: 0, time: 0 });
  motion.record({ x: 0, y: 0, time: 1000 });
  motion.record({ x: 0, y: -100, time: 1040 });
  assert.ok(motion.release({ x: 0, y: -110, time: 1050 }) > 0.2);
});

test("deceleration and small finger drift produce a low final speed", () => {
  const motion = new HomeSwipeMotion({ x: 0, y: 0, time: 0 });
  motion.record({ x: 0, y: -100, time: 40 });
  motion.record({ x: 0, y: -110, time: 80 });
  motion.record({ x: 2, y: -112, time: 120 });
  assert.ok(motion.release({ x: 0, y: -111, time: 160 }) < 0.2);
});

test("normal release-event gaps do not dilute a continuing swipe into a stationary release", () => {
  const motion = new HomeSwipeMotion({ x: 0, y: 0, time: 0 });
  motion.record({ x: 0, y: -10, time: 40 });
  motion.record({ x: 0, y: -20, time: 80 });
  assert.ok(motion.release({ x: 0, y: -20, time: 120 }) > 0.2);
});
