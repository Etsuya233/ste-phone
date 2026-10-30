import test from "node:test";
import assert from "node:assert/strict";
import { appSession } from "./app-session.ts";
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
