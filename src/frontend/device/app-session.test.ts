import test from "node:test";
import assert from "node:assert/strict";
import { appSession, appsBeyondLimit } from "./app-session.ts";
import type { AppSession } from "./app-session.ts";

test("Home and Expose preserve running apps; switching reorders them and explicit quit removes them", () => {
  let state: AppSession = { foreground: "home", recent: [] };
  state = appSession(state, { type: "open", app: "stopwatch" });
  state = appSession(state, { type: "home" });
  state = appSession(state, { type: "open", app: "foundation" });
  state = appSession(state, { type: "expose" });
  assert.deepEqual(state.recent, ["foundation", "stopwatch"]);
  state = appSession(state, { type: "open", app: "stopwatch" });
  assert.deepEqual(state, { foreground: "stopwatch", recent: ["stopwatch", "foundation"] });
  state = appSession(state, { type: "expose" });
  state = appSession(state, { type: "quit", app: "stopwatch" });
  assert.deepEqual(state, { foreground: "expose", recent: ["foundation"] });
  state = appSession(state, { type: "quit", app: "foundation" });
  assert.deepEqual(state, { foreground: "expose", recent: [] });
});

test("the limit counts the foreground and evicts the least recently opened apps", () => {
  const state: AppSession = { foreground: "home", recent: ["stopwatch", "foundation"] };
  const opened = appSession(state, { type: "open", app: "foundation" });
  assert.deepEqual(appsBeyondLimit(opened, null), []);
  assert.deepEqual(appsBeyondLimit(opened, 2), []);

  const evicted = appsBeyondLimit(opened, 1);
  assert.deepEqual(evicted, ["stopwatch"]);
  assert.deepEqual(appSession(opened, { type: "evict", apps: evicted }), {
    foreground: "foundation",
    recent: ["foundation"],
  });
});

test("lowering the limit on Home keeps only the most recent apps", () => {
  const state: AppSession = { foreground: "home", recent: ["settings", "foundation", "stopwatch"] };
  const evicted = appsBeyondLimit(state, 1);
  assert.deepEqual(evicted, ["foundation", "stopwatch"]);
  assert.deepEqual(appSession(state, { type: "evict", apps: evicted }), {
    foreground: "home",
    recent: ["settings"],
  });
});
