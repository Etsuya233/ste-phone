import assert from "node:assert/strict";
import test from "node:test";
import type { ImageRecord } from "../../core/image-hub/public.ts";
import { groupImagesBySavedAt } from "./gallery-groups.ts";

function image(id: string, savedAt: Date): ImageRecord {
  const time = savedAt.toISOString();
  return { id, imagePath: `${id}.png`, prompt: id, startedAt: time, savedAt: time };
}

test("图库按本地日历划分今天、昨天和更早", () => {
  const now = new Date(2026, 10, 4, 12, 0);
  const groups = groupImagesBySavedAt(
    [
      image("today-start", new Date(2026, 10, 4, 0, 0)),
      image("yesterday-end", new Date(2026, 10, 3, 23, 59)),
      image("day-before", new Date(2026, 10, 2, 23, 59)),
    ],
    now,
  );
  assert.deepEqual(
    groups.map((group) => ({
      title: group.title,
      ids: group.images.map((item) => item.id),
    })),
    [
      { title: "今天", ids: ["today-start"] },
      { title: "昨天", ids: ["yesterday-end"] },
      { title: "更早", ids: ["day-before"] },
    ],
  );
});

test("分组保持输入顺序并丢弃空组", () => {
  const now = new Date(2026, 10, 4, 12, 0);
  const groups = groupImagesBySavedAt(
    [
      image("older-first", new Date(2026, 9, 20, 8, 0)),
      image("yesterday-first", new Date(2026, 10, 3, 9, 0)),
      image("older-second", new Date(2026, 9, 21, 8, 0)),
      image("yesterday-second", new Date(2026, 10, 3, 10, 0)),
    ],
    now,
  );
  assert.deepEqual(
    groups.map((group) => ({
      title: group.title,
      ids: group.images.map((item) => item.id),
    })),
    [
      { title: "昨天", ids: ["yesterday-first", "yesterday-second"] },
      { title: "更早", ids: ["older-first", "older-second"] },
    ],
  );
});

test("无效保存时间归入更早", () => {
  const now = new Date(2026, 10, 4, 12, 0);
  const invalid = { ...image("invalid", new Date(2026, 10, 4, 12, 0)), savedAt: "not-a-date" };
  const groups = groupImagesBySavedAt([invalid], now);
  assert.deepEqual(
    groups.map((group) => ({
      title: group.title,
      ids: group.images.map((item) => item.id),
    })),
    [{ title: "更早", ids: ["invalid"] }],
  );
});
