import assert from "node:assert/strict";
import test from "node:test";
import { PhoneContextService } from "./phone-context-service.ts";
import { validateContextData } from "./context-validation.ts";
import type { PhoneContextData, PhoneContextPreset } from "./public.ts";
import type { ContextSource } from "../../core/phone-context/public.ts";

const preset: PhoneContextPreset = {
  id: "recent",
  name: "最近微信",
  sourceId: "sample",
  selection: { scopeId: "scope", personIds: ["a", "b"], recentMinutes: 30, limitPerGroup: 50 },
};
function fixture() {
  let chatId = "a";
  let text = "first";
  const listeners = new Set<() => void>();
  const saved = new Map<string, PhoneContextData>([["a", { version: 1, presets: [preset] }]]);
  let writing: Promise<void> = Promise.resolve();
  const source: ContextSource = {
    id: "sample",
    label: "样例",
    minimumPeople: 1,
    validateSelection() {},
    listScopes: () => [],
    read: () => ({
      text,
      itemCount: 1,
      groupCount: 1,
      excluded: { barrier: 0, time: 0, limit: 0 },
    }),
  };
  const service = new PhoneContextService({
    chat: {
      getSnapshot: () => ({ id: chatId, name: chatId }),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    },
    sources: [source],
    storage: {
      read: (id) => saved.get(id) ?? null,
      write: async (id, data) => {
        await writing;
        saved.set(id, data);
      },
    },
  });
  return {
    service,
    saved,
    setText: (value: string) => {
      text = value;
    },
    delay: (promise: Promise<void>) => {
      writing = promise;
    },
    switch: (id: string) => {
      chatId = id;
      for (const listener of listeners) {
        listener();
      }
    },
  };
}

test("宏每次读取保存预设和来源，预览草稿不保存也不消费记录", async () => {
  const f = fixture();
  assert.equal(f.service.expand("recent"), "first");
  f.setText("new");
  assert.equal(f.service.expand("recent"), "new");
  assert.equal(f.service.preview({ ...preset, id: "draft" }).text, "new");
  assert.throws(() => f.service.expand("draft"), /不存在/);
  await f.service.save({ ...preset, name: "改名" });
  assert.equal(f.service.getSnapshot().presets[0]!.name, "改名");
  await f.service.remove("recent");
  assert.throws(() => f.service.expand("recent"), /不存在/);
});

test("保存期间切聊天不将旧预设发布到新聊天，切回读取已保存值", async () => {
  const f = fixture();
  const pending = Promise.withResolvers<void>();
  f.delay(pending.promise);
  const saving = f.service.save({ ...preset, name: "已更新" });
  f.switch("b");
  assert.equal(f.service.getSnapshot().presets.length, 0);
  pending.resolve();
  await saving;
  assert.equal(f.service.getSnapshot().chatId, "b");
  assert.equal(f.service.getSnapshot().presets.length, 0);
  f.switch("a");
  assert.equal(f.service.getSnapshot().presets[0]!.name, "已更新");
});

test("保存失败保留原预设，损坏配置和未知来源明确报错", async () => {
  const f = fixture();
  f.delay(Promise.reject(new Error("保存失败")));
  await assert.rejects(f.service.save({ ...preset, name: "未保存" }), /保存失败/);
  assert.equal(f.service.getSnapshot().presets[0]!.name, preset.name);
  assert.equal(f.service.getSnapshot().error, "保存失败");
  assert.throws(() => f.service.preview({ ...preset, sourceId: "missing" }), /来源不可用/);
  assert.throws(() => validateContextData({ version: 2, presets: [] }), /格式无效/);
  assert.throws(() => validateContextData({ version: 1, presets: [preset, preset] }), /重复/);
});

test("通用预设允许单人物来源，人数要求由应用定义", async () => {
  const f = fixture();
  await f.service.save({ ...preset, selection: { ...preset.selection, personIds: ["a"] } });
  assert.equal(f.service.getSnapshot().presets[0]!.selection.personIds.length, 1);
});
