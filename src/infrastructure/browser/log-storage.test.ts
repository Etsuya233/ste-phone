import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { logRecord } from "../../apps/logs/log-record.ts";
import { createIndexedDbLogStorage } from "./log-storage.ts";

const key = "ste-phone-logs-v1";
const retention = { count: 1000, bytes: 32 * 1024 * 1024 };

function setup(legacyValue: string | null = null) {
  const factory = new IDBFactory();
  const legacy = {
    getItem: () => legacyValue,
    removeItem: () => {
      legacyValue = null;
    },
  };
  const open = () =>
    createIndexedDbLogStorage(key, {
      factory: () => factory,
      legacyStorage: () => legacy,
    });
  return { open, legacy };
}

function entry(id: string, content = id, groupId?: string) {
  return logRecord(
    { id, time: 0, level: "info", app: "system", scope: "test", message: id, groupId },
    content,
  );
}

function legacyEntry(id: number, details: string) {
  return { id, time: 0, level: "info", app: "system", scope: "test", message: String(id), details };
}

test("appending writes only the new summary and full detail", async (context) => {
  const { open } = setup();
  const storage = open();
  await storage.load(retention);
  await storage.append(entry("one"), retention);
  const additions: string[] = [];
  const add = IDBObjectStore.prototype.add;
  context.mock.method(
    IDBObjectStore.prototype,
    "add",
    function (this: IDBObjectStore, ...args: [unknown, IDBValidKey?]) {
      additions.push(this.name);
      return add.apply(this, args);
    },
  );
  assert.deepEqual(await storage.append(entry("two"), retention), []);
  assert.deepEqual(additions, ["summaries", "details"]);
  assert.equal(await storage.getDetails("one"), "one");
  assert.equal(await storage.getDetails("two"), "two");
});

test("count and UTF-8 byte budgets evict entire oldest request groups and their details", async () => {
  const storage = setup().open();
  await storage.load(retention);
  const first = entry("first", "开始", "request");
  const unrelated = entry("unrelated", "独立");
  const terminal = entry("terminal", "完成", "request");
  const latest = entry("latest", "新日志");
  for (const record of [first, unrelated, terminal]) {
    await storage.append(record, retention);
  }

  assert.deepEqual(await storage.append(latest, { count: 3, bytes: retention.bytes }), [
    "first",
    "terminal",
  ]);
  assert.equal(await storage.getDetails("first"), undefined);
  assert.equal(await storage.getDetails("terminal"), undefined);
  assert.equal(await storage.getDetails("unrelated"), "独立");
  const large = entry("large", "新内容".repeat(100));
  assert.deepEqual(
    await storage.append(large, { count: retention.count, bytes: large.bytes + latest.bytes }),
    ["unrelated"],
  );
  assert.deepEqual(
    (await storage.load(retention)).entries.map(({ id }) => id),
    ["latest", "large"],
  );
  assert.equal(await storage.getDetails("large"), large.content);
});

test("quota retries at most once and rolls back evictions when the second write fails", async (context) => {
  const storage = setup().open();
  await storage.load(retention);
  await storage.append(entry("old"), retention);
  const add = IDBObjectStore.prototype.add;
  let failures = 0;
  let rejectCount = 2;
  context.mock.method(
    IDBObjectStore.prototype,
    "add",
    function (this: IDBObjectStore, ...args: [unknown, IDBValidKey?]) {
      if (this.name === "details" && failures < rejectCount) {
        failures++;
        throw new DOMException("simulated quota", "QuotaExceededError");
      }
      return add.apply(this, args);
    },
  );
  await assert.rejects(storage.append(entry("new"), retention), { name: "QuotaExceededError" });
  assert.equal(failures, 2);
  assert.equal(await storage.getDetails("old"), "old");
  assert.equal(await storage.getDetails("new"), undefined);

  rejectCount = 3;
  assert.deepEqual(await storage.append(entry("new"), retention), ["old"]);
  assert.equal(failures, 3);
  assert.equal(await storage.getDetails("old"), undefined);
  assert.equal(await storage.getDetails("new"), "new");
});

test("failed migration leaves legacy data in place and a later load retries the migration", async (context) => {
  const raw = JSON.stringify({
    version: 1,
    nextId: 3,
    entries: [legacyEntry(1, "完整正文"), legacyEntry(2, "完整错误")],
  });
  const { open, legacy } = setup(raw);
  const add = IDBObjectStore.prototype.add;
  const error = context.mock.method(
    IDBObjectStore.prototype,
    "add",
    function (this: IDBObjectStore, ...args: [unknown, IDBValidKey?]) {
      if (this.name === "details" && args[1] === "legacy:2") {
        throw new DOMException("quota", "QuotaExceededError");
      }
      return add.apply(this, args);
    },
  );
  const storage = open();
  await assert.rejects(storage.load(retention), { name: "QuotaExceededError" });
  assert.equal(legacy.getItem(), raw);
  assert.equal(await storage.getDetails("legacy:1"), undefined);
  error.mock.restore();

  const restored = await storage.load(retention);
  assert.deepEqual(
    restored.entries.map(({ id }) => id),
    ["legacy:1", "legacy:2"],
  );
  assert.equal(legacy.getItem(), null);
  assert.equal(await open().getDetails("legacy:2"), "完整错误");
});

test("committed migration and clear are reported accurately when removing the old key fails", async (context) => {
  const raw = JSON.stringify({ version: 1, entries: [legacyEntry(1, "完整正文")] });
  const { open, legacy } = setup(raw);
  const remove = context.mock.method(legacy, "removeItem", () => {
    throw new Error("blocked");
  });
  const migrated = await open().load(retention);
  assert.match(migrated.warning!, /旧版 LocalStorage 副本仍在/);
  assert.equal(migrated.entries.length, 1);
  const reopened = open();
  assert.equal((await reopened.load(retention)).entries.length, 1);
  assert.match((await reopened.clear())!, /旧版 LocalStorage 副本仍在/);
  assert.equal(await reopened.getDetails("legacy:1"), undefined);
  assert.equal(legacy.getItem(), raw);
  remove.mock.restore();

  assert.deepEqual((await open().load(retention)).entries, []);
  assert.equal(legacy.getItem(), null);
});

test("migration reports when the old records exceed the configured capacity", async () => {
  const raw = JSON.stringify({
    version: 1,
    entries: [legacyEntry(1, "old"), legacyEntry(2, "new")],
  });
  const { open, legacy } = setup(raw);
  const result = await open().load({ count: 1, bytes: retention.bytes });
  assert.deepEqual(
    result.entries.map(({ id }) => id),
    ["legacy:2"],
  );
  assert.match(result.warning!, /容量限制清理了 1 条/);
  assert.equal(legacy.getItem(), null);
});
