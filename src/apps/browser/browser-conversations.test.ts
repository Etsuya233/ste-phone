import assert from "node:assert/strict";
import test from "node:test";
import { BrowserConversations } from "./browser-conversations.ts";
import { newWebsite, type BrowserData } from "./browser.ts";

const author = { sourceId: "memory", scopeId: "scope", id: "author", name: "作者" };

function storage() {
  const values = new Map<string, string>();
  return new BrowserConversations({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  });
}

test("旧对话迁入本机，清空记录阻止旧宿主副本复活，其他作品和聊天独立", () => {
  const local = storage();
  const first = { ...newWebsite(author), turns: [{ instruction: "旧请求", reply: "旧回复" }] };
  const second = { ...newWebsite(author), turns: [{ instruction: "另一作品", reply: "回复" }] };
  const data: BrowserData = { version: 1, works: [first, second] };
  local.restore("a", data);
  local.restore("b", data);
  local.write("a", [{ ...first, turns: [] }], new Map());
  assert.deepEqual(
    local.restore("a", data).saved.works.map((work) => work.turns),
    [[], second.turns],
  );
  assert.deepEqual(
    local.restore("b", data).saved.works.map((work) => work.turns),
    [first.turns, second.turns],
  );
});

test("重载中断的过程保留工具参数和结果，并标记为停止", () => {
  const local = storage();
  const work = newWebsite(author);
  const steps = [
    {
      kind: "tool" as const,
      id: "call",
      label: "读取文件",
      status: "completed" as const,
      input: { path: "index.html" },
      output: "<main />",
    },
  ];
  local.write(
    "a",
    [work],
    new Map([
      [work.id, { runId: 1, turnIndex: 0, instruction: "修改页面", steps, status: "running" }],
    ]),
  );
  const restored = local.restore("a", { version: 1, works: [work] });
  assert.equal(restored.activities.get(work.id)!.status, "stopped");
  assert.deepEqual(restored.activities.get(work.id)!.steps, steps);
});
