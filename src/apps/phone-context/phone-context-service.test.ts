import assert from "node:assert/strict";
import test from "node:test";
import { PhoneContextService } from "./phone-context-service.ts";
import { validateContextData } from "./context-validation.ts";
import type { PhoneContextData, PhoneContextPreset } from "./public.ts";
import type { AppIntentSource } from "../../core/phone-context/public.ts";

const preset: PhoneContextPreset = {
  id: "recent",
  name: "最近微信",
  sourceId: "sample",
  intentId: "intent-a",
};
function fixture() {
  let chatId = "a";
  let text = "first";
  let intents = [{ id: "intent-a", name: "应用自有方案" }];
  const listeners = new Set<() => void>();
  const saved = new Map<string, PhoneContextData>([["a", { version: 2, presets: [preset] }]]);
  let writing: Promise<void> = Promise.resolve();
  const source: AppIntentSource = {
    id: "sample",
    label: "样例",
    listIntents: () => intents,
    readIntent: ({ intentId }) => {
      if (!intents.some(({ id }) => id === intentId)) {
        throw new Error("App Intent 已不存在");
      }
      return text;
    },
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
    setIntents: (value: typeof intents) => {
      intents = value;
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

test("宏只引用 Intent，应用改名和更新内容后展开实时读取，预览不保存", async () => {
  const f = fixture();
  assert.equal(f.service.expand("recent"), "first");
  f.setText("new");
  f.setIntents([{ id: "intent-a", name: "已改名" }]);
  assert.equal(f.service.expand("recent"), "new");
  assert.equal(f.service.preview({ ...preset, id: "draft" }), "new");
  assert.throws(() => f.service.expand("draft"), /不存在/);
  await f.service.save({ ...preset, name: "宏显示名" });
  assert.equal(f.service.getSnapshot().presets[0]!.name, "宏显示名");
  assert.deepEqual(f.service.getSnapshot().presets[0], { ...preset, name: "宏显示名" });
  await f.service.remove("recent");
  assert.throws(() => f.service.expand("recent"), /不存在/);
});

test("保存期间切聊天不将旧绑定发布到新聊天，切回读取已保存值", async () => {
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

test("保存失败保留绑定，损坏配置和未知应用明确报错", async () => {
  const f = fixture();
  f.delay(Promise.reject(new Error("保存失败")));
  await assert.rejects(f.service.save({ ...preset, name: "未保存" }), /保存失败/);
  assert.equal(f.service.getSnapshot().presets[0]!.name, preset.name);
  assert.equal(f.service.getSnapshot().error, "保存失败");
  assert.throws(() => f.service.preview({ ...preset, sourceId: "missing" }), /来源不可用/);
  assert.throws(() => validateContextData({ version: 1, presets: [] }), /格式无效/);
  assert.throws(() => validateContextData({ version: 2, presets: [preset, preset] }), /重复/);
});

test("删除应用 Intent 后绑定保持可见，读取和重新保存明确报告引用失效", async () => {
  const f = fixture();
  f.setIntents([]);
  assert.equal(f.service.getSnapshot().presets.length, 1);
  assert.throws(() => f.service.expand("recent"), /Intent 已不存在/);
  await assert.rejects(f.service.save(preset), /Intent 已不存在/);
  await f.service.remove(preset.id);
  assert.equal(f.service.getSnapshot().presets.length, 0);
});

test("不同应用配置完全不进入 ST 契约，仅通过不透明 Intent ID 读取", () => {
  const textByIntent = new Map([["route:map/42", "路线：广场 → 图书馆"]]);
  const service = new PhoneContextService({
    chat: { getSnapshot: () => ({ id: "chat", name: "剧情" }), subscribe: () => () => {} },
    storage: {
      read: () => ({
        version: 2,
        presets: [{ id: "route", name: "当前路线", sourceId: "map", intentId: "route:map/42" }],
      }),
      write: async () => {},
    },
    sources: [
      {
        id: "map",
        label: "地图",
        listIntents: () => [{ id: "route:map/42", name: "当前位置到图书馆" }],
        readIntent: ({ chatId, intentId, now }) => {
          assert.equal(chatId, "chat");
          assert.ok(Number.isFinite(now));
          return textByIntent.get(intentId)!;
        },
      },
    ],
  });
  assert.equal(service.expand("route"), "路线：广场 → 图书馆");
});
