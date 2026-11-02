import assert from "node:assert/strict";
import test from "node:test";
import type { DiaryAuthor, DiaryEntry } from "./diary.ts";
import { readDiaryBooks, diaryAuthorKey } from "./diary-books.ts";

const author = (id: string, name: string): DiaryAuthor => ({
  id,
  name,
  profileText: `${name}的资料`,
  sourceId: "memory",
  scopeId: "space",
});

const entry = (
  id: string,
  owner: Omit<DiaryAuthor, "profileText">,
  createdAt = "2026-10-31T00:00:00.000Z",
): DiaryEntry => ({
  id,
  author: owner,
  worldTime: "2026-10-30 16:45:00",
  body: id,
  createdAt,
});

const snapshot = (owner: DiaryAuthor): Omit<DiaryAuthor, "profileText"> => ({
  id: owner.id,
  name: owner.name,
  sourceId: owner.sourceId,
  scopeId: owner.scopeId,
});

test("books put everyone's diary first and keep empty characters as writable books", () => {
  const red = author("red", "小红");
  const blue = author("blue", "小蓝");
  const books = readDiaryBooks([red, blue], [entry("a", snapshot(red))]);

  assert.deepEqual(
    books.map((book) => book.key),
    ["all", diaryAuthorKey(red), diaryAuthorKey(blue)],
  );
  assert.equal(books[0]!.entries.length, 1);
  assert.equal(books[1]!.entries[0]!.id, "a");
  assert.equal(books[2]!.entries.length, 0);
  assert.equal(books[2]!.unavailable, false);
});

test("books with entries sort by the latest createdAt and empty books follow by name", () => {
  const red = author("red", "小红");
  const blue = author("blue", "小蓝");
  const old = author("old", "阿旧");
  const green = author("green", "小绿");
  const books = readDiaryBooks(
    [red, blue, old, green],
    [
      entry("red-old", snapshot(red), "2026-10-20T00:00:00.000Z"),
      entry("blue-new", snapshot(blue), "2026-10-31T00:00:00.000Z"),
      entry("red-new", snapshot(red), "2026-10-28T00:00:00.000Z"),
      entry("old-entry", snapshot(old), "2026-10-25T00:00:00.000Z"),
    ],
  );

  assert.deepEqual(
    books.slice(1).map((book) => book.name),
    ["小蓝", "小红", "阿旧", "小绿"],
  );
  assert.equal(books[1]!.entries[0]!.id, "blue-new");
  assert.equal(books[2]!.entries[0]!.id, "red-new");
});

test("saved authors missing from the current data stay readable and unavailable", () => {
  const red = author("red", "小红");
  const old = author("old", "阿旧");
  const books = readDiaryBooks(
    [red],
    [
      entry("a", snapshot(red), "2026-10-20T00:00:00.000Z"),
      entry("b", snapshot(old), "2026-10-31T00:00:00.000Z"),
    ],
  );

  assert.equal(books[1]!.key, diaryAuthorKey(old));
  assert.equal(books[1]!.unavailable, true);
  assert.equal(books[1]!.entries[0]!.id, "b");
});

test("same display name with different stable identity becomes a separate book", () => {
  const red = author("red", "小红");
  const otherRed = author("another-red", "小红");
  const books = readDiaryBooks([red, otherRed], []);

  assert.equal(books.length, 3);
  assert.notEqual(books[1]!.key, books[2]!.key);
});

test("entries keep their saved order inside every book", () => {
  const red = author("red", "小红");
  const books = readDiaryBooks([red], [entry("new", snapshot(red)), entry("old", snapshot(red))]);

  assert.deepEqual(
    books[1]!.entries.map((item) => item.id),
    ["new", "old"],
  );
});
