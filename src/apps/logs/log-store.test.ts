import assert from "node:assert/strict";
import test from "node:test";
import { createPhoneLog } from "./public.ts";
import type { LogStorage } from "./ports/log-storage.ts";

function memoryStorage(): LogStorage {
  let value: string | null = null;
  return {
    read: () => value,
    write: (next) => {
      value = next;
    },
    clear: () => {
      value = null;
    },
  };
}

test("keeps the newest entries and restores them from storage", (context) => {
  context.mock.method(console, "info", () => {});
  const storage = memoryStorage();
  const logs = createPhoneLog({ storage, limit: 5 });
  for (let index = 0; index < 7; index++) {
    logs.info("system", "test", `entry-${index}`);
  }
  const restored = createPhoneLog({ storage, limit: 5 });
  assert.deepEqual(
    restored.getSnapshot().map((entry) => entry.message),
    ["entry-2", "entry-3", "entry-4", "entry-5", "entry-6"],
  );
});

test("clear removes entries from memory and storage", (context) => {
  context.mock.method(console, "info", () => {});
  const storage = memoryStorage();
  const logs = createPhoneLog({ storage, limit: 5 });
  logs.info("system", "test", "entry");
  logs.clear();
  assert.equal(logs.getSnapshot().length, 0);
  assert.equal(createPhoneLog({ storage, limit: 5 }).getSnapshot().length, 0);
});

test("notifies subscribers until they unsubscribe", (context) => {
  context.mock.method(console, "info", () => {});
  const logs = createPhoneLog({ storage: memoryStorage(), limit: 5 });
  let calls = 0;
  const unsubscribe = logs.subscribe(() => {
    calls++;
  });
  logs.info("system", "test", "first");
  assert.equal(calls, 1);
  unsubscribe();
  logs.info("system", "test", "second");
  assert.equal(calls, 1);
});

test("stores errors and circular details as readable text", (context) => {
  context.mock.method(console, "error", () => {});
  context.mock.method(console, "warn", () => {});
  const storage = memoryStorage();
  const logs = createPhoneLog({ storage, limit: 5 });
  logs.error("diary", "STE Phone AI", "请求失败", new Error("boom", { cause: { status: 500 } }));
  const circular: Record<string, unknown> = { name: "loop" };
  circular.self = circular;
  logs.warn("system", "test", "循环对象", circular);
  const details = createPhoneLog({ storage, limit: 5 }).getSnapshot();
  assert.match(details[0]!.details!, /boom/);
  assert.match(details[0]!.details!, /"status": 500/);
  assert.match(details[1]!.details!, /\[Circular\]/);
});

test("ignores unreadable or outdated storage", () => {
  const storage = memoryStorage();
  storage.write("not json");
  assert.equal(createPhoneLog({ storage }).getSnapshot().length, 0);
  storage.write(JSON.stringify({ version: 99, entries: [] }));
  assert.equal(createPhoneLog({ storage }).getSnapshot().length, 0);
});
