import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import { createIndexedDbLogStorage } from "../../infrastructure/browser/log-storage.ts";
import { createPhoneLog } from "./public.ts";

function setup() {
  const factory = new IDBFactory();
  return createIndexedDbLogStorage("logs", {
    factory: () => factory,
    legacyStorage: () => ({ getItem: () => null, removeItem: () => {} }),
  });
}

test("startup preserves pending IDs and restores only summaries until a detail is opened", async (context) => {
  context.mock.method(console, "info", () => {});
  const storage = setup();
  const original = createPhoneLog({ storage });
  original.info("system", "test", "earlier", "earlier full detail");
  await original.retry();

  const read = context.mock.method(storage, "getDetails");
  const logs = createPhoneLog({ storage });
  logs.info("system", "test", "startup", "startup full detail");
  const pending = logs.getSnapshot().entries[0]!;
  assert.equal(pending.status, "pending");
  assert.equal(await logs.getDetails(pending.id), "startup full detail");
  assert.equal(read.mock.callCount(), 0);
  await logs.retry();
  const { entries } = logs.getSnapshot();
  assert.deepEqual(
    entries.map(({ message }) => message),
    ["earlier", "startup"],
  );
  assert.equal(entries[1]!.id, pending.id);
  assert.ok(entries.every((entry) => !("details" in entry)));
  assert.equal(read.mock.callCount(), 0);
  assert.equal(await logs.getDetails(pending.id), "startup full detail");
  assert.equal(read.mock.callCount(), 1);
});

test("a failed clear preserves records and a successful clear respects enqueue order", async (context) => {
  context.mock.method(console, "info", () => {});
  const storage = setup();
  const logs = createPhoneLog({ storage });
  logs.info("system", "test", "first");
  const clear = context.mock.method(storage, "clear", () => Promise.reject(new Error("blocked")));
  await logs.clear();
  assert.deepEqual(
    logs.getSnapshot().entries.map(({ message }) => message),
    ["first"],
  );
  assert.match(logs.getSnapshot().storageError!, /清除日志失败.*blocked/);
  clear.mock.restore();

  logs.info("system", "test", "before clear");
  const clearing = logs.clear();
  logs.info("system", "test", "after clear");
  await clearing;
  await logs.retry();
  const { entries } = await storage.load({ count: 1000, bytes: 32 * 1024 * 1024 });
  assert.deepEqual(
    entries.map(({ message }) => message),
    ["after clear"],
  );
  assert.deepEqual(
    logs.getSnapshot().entries.map(({ message }) => message),
    ["after clear"],
  );
});

test("bounded failed details remain readable and a retry persists the available records", async (context) => {
  context.mock.method(console, "warn", () => {});
  const storage = setup();
  const append = context.mock.method(storage, "append", () => Promise.reject(new Error("quota")));
  const logs = createPhoneLog({ storage, pendingBytes: 500 });
  logs.warn("system", "test", "failure", "A".repeat(200));
  logs.warn("system", "test", "out of space", "B".repeat(200));
  await logs.retry();
  const [failed, dropped] = logs.getSnapshot().entries;
  assert.equal(failed!.status, "unsaved");
  assert.equal(dropped!.status, "unavailable");
  assert.match(logs.getSnapshot().storageError!, /保存日志失败.*quota/);
  assert.equal(await logs.getDetails(failed!.id), "A".repeat(200));
  assert.equal(await logs.getDetails(dropped!.id), undefined);
  append.mock.restore();

  await logs.retry();
  assert.equal(logs.getSnapshot().entries[0]!.status, "saved");
  assert.equal(await logs.getDetails(failed!.id), "A".repeat(200));
});

test("initialization can recover without dropping logs received during the failure", async (context) => {
  context.mock.method(console, "error", () => {});
  const storage = setup();
  const load = context.mock.method(storage, "load", () => Promise.reject(new Error("blocked")));
  const logs = createPhoneLog({ storage });
  logs.error("diary", "STE Phone AI", "请求失败", new Error("boom", { cause: { status: 500 } }));
  await logs.retry();
  const entry = logs.getSnapshot().entries[0]!;
  assert.equal(entry.status, "unsaved");
  assert.match(logs.getSnapshot().storageError!, /读取日志失败.*blocked/);
  load.mock.restore();

  await logs.retry();
  assert.equal(logs.getSnapshot().entries[0]!.status, "saved");
  const details = await logs.getDetails(entry.id);
  assert.match(details!, /boom/);
  assert.match(details!, /"status": 500/);
});

test("an individually oversized detail is available for copying without entering storage", async (context) => {
  context.mock.method(console, "info", () => {});
  const storage = setup();
  const logs = createPhoneLog({ storage, bytes: 300 });
  const content = "中文".repeat(120);
  logs.info("system", "test", "oversized", content);
  await logs.retry();
  const row = logs.getSnapshot().entries[0]!;
  assert.equal(row.status, "unsaved");
  assert.equal(await logs.getDetails(row.id), content);
  assert.equal(await storage.getDetails(row.id), undefined);
});

test("clearing during initial load also removes restored history and preserves subsequent writes", async (context) => {
  context.mock.method(console, "info", () => {});
  const storage = setup();
  const original = createPhoneLog({ storage });
  original.info("system", "test", "restored");
  await original.retry();

  const started = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  const load = storage.load;
  context.mock.method(storage, "load", async (...args: Parameters<typeof load>) => {
    started.resolve();
    await gate.promise;
    return load(...args);
  });
  const logs = createPhoneLog({ storage });
  await started.promise;
  logs.info("system", "test", "before clear");
  const clearing = logs.clear();
  logs.info("system", "test", "after clear");
  gate.resolve();
  await clearing;
  await logs.retry();
  assert.deepEqual(
    logs.getSnapshot().entries.map(({ message }) => message),
    ["after clear"],
  );
  assert.deepEqual(
    (await storage.load({ count: 1000, bytes: 100000 })).entries.map(({ message }) => message),
    ["after clear"],
  );
});

test("retry preserves append order when writes continue during a storage failure", async (context) => {
  context.mock.method(console, "info", () => {});
  const storage = setup();
  const entered = Promise.withResolvers<void>();
  const gate = Promise.withResolvers<void>();
  const append = storage.append;
  const block = context.mock.method(
    storage,
    "append",
    async (...args: Parameters<typeof append>) => {
      if (args[0].summary.message === "first") {
        entered.resolve();
        await gate.promise;
        throw new Error("quota");
      }
      return append(...args);
    },
  );
  const logs = createPhoneLog({ storage });
  logs.info("system", "test", "first");
  await entered.promise;
  logs.info("system", "test", "second");
  gate.resolve();
  await logs.retry();
  assert.equal(block.mock.callCount(), 2);
  assert.ok(logs.getSnapshot().entries.every(({ status }) => status === "unsaved"));
  block.mock.restore();

  const retrying = logs.retry();
  logs.info("system", "test", "third");
  await retrying;
  await logs.retry();
  const saved = await storage.load({ count: 1000, bytes: 100000 });
  assert.deepEqual(
    saved.entries.map(({ message }) => message),
    ["first", "second", "third"],
  );
});
