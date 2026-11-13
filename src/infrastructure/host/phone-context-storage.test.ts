import assert from "node:assert/strict";
import { test } from "node:test";
import { createStChatMetadataStorage, type StChatSaveContext } from "./chat-metadata-storage.ts";
import { createStPhoneContextStorage } from "./phone-context-storage.ts";
import { createStWechatIntentStorage } from "./wechat-intent-storage.ts";
import { createStWechatStorage } from "./wechat-storage.ts";
import { readPhoneIntentBlocks } from "./phone-intent-migration.ts";
import type { PhoneContextData } from "../../apps/phone-context/public.ts";

const selection = {
  scopeId: "space",
  personIds: ["a", "b"],
  recentMinutes: null,
  limitPerGroup: 50,
};
const legacy = {
  version: 1,
  presets: [{ id: "recent", name: "最近聊天", sourceId: "wechat", selection }],
};
const binding: PhoneContextData = {
  version: 2,
  presets: [{ id: "recent", name: "最近聊天", sourceId: "wechat", intentId: "recent" }],
};
const intentData = {
  version: 1 as const,
  intents: [{ id: "recent", name: "最近聊天", selection }],
};

function fixture(phone: Record<string, unknown> = {}) {
  const context: StChatSaveContext = {
    chatId: "story",
    groupId: "group",
    characters: [],
    chat: [],
    chatMetadata: { ste_phone: phone, otherPlugin: "keep" },
    getRequestHeaders: () => ({}),
    eventTypes: { CHAT_CHANGED: "", CHAT_RENAMED: "", CHARACTER_RENAMED: "", GROUP_UPDATED: "" },
    eventSource: { on() {}, removeListener() {} },
  };
  const response = Promise.withResolvers<Response>();
  const submitted: Record<string, unknown>[] = [];
  const metadata = createStChatMetadataStorage(
    () => context,
    { getSnapshot: () => ({ id: "chat", name: "story" }), subscribe: () => () => {} },
    async (_url, init) => {
      submitted.push(JSON.parse(init!.body as string).chat[0].chat_metadata.ste_phone);
      return submitted.length === 1 ? response.promise : new Response(null, { status: 200 });
    },
  );
  return {
    context,
    response,
    submitted,
    bindings: createStPhoneContextStorage(metadata),
    intents: createStWechatIntentStorage(metadata),
    wechat: createStWechatStorage(metadata),
  };
}

test("旧预设同步投影为微信 Intent 与宏绑定，读取不写回也不修改原数据", () => {
  const f = fixture({ contextPresets: legacy });
  const before = structuredClone(f.context.chatMetadata);
  assert.deepEqual(f.bindings.read("chat"), binding);
  assert.deepEqual(f.intents.read("chat"), intentData);
  assert.deepEqual(f.context.chatMetadata, before);
  assert.equal(f.submitted.length, 0);
});

test("首次删除迁移 Intent 时两个新数据块原子保存，旧宏保留失效引用且不会复活 Intent", async () => {
  const f = fixture({ contextPresets: legacy, diary: { retained: true } });
  const saving = f.intents.write("chat", { version: 1, intents: [] });
  assert.deepEqual(f.submitted[0], {
    contextPresets: binding,
    wechatIntents: { version: 1, intents: [] },
    diary: { retained: true },
  });
  assert.deepEqual(f.intents.read("chat"), intentData);
  f.response.resolve(new Response(null, { status: 200 }));
  await saving;
  assert.deepEqual(f.intents.read("chat"), { version: 1, intents: [] });
  assert.deepEqual(f.bindings.read("chat"), binding);
  assert.equal(f.context.chatMetadata.otherPlugin, "keep");
});

test("迁移提交失败保持两个旧读取结果，重试宏绑定保存同时提交 Intent", async () => {
  const f = fixture({ contextPresets: legacy });
  const edited: PhoneContextData = {
    version: 2,
    presets: [{ ...binding.presets[0]!, name: "改名" }],
  };
  const saving = f.bindings.write("chat", edited);
  const failed = assert.rejects(saving, /500/);
  f.response.resolve(new Response(null, { status: 500 }));
  await failed;
  assert.deepEqual(f.bindings.read("chat"), binding);
  assert.deepEqual(f.intents.read("chat"), intentData);
  await f.bindings.write("chat", edited);
  assert.deepEqual(f.bindings.read("chat"), edited);
  assert.deepEqual(f.intents.read("chat"), intentData);
});

test("Intent 与宏绑定及微信消息并发保存按队列读取最新块，不互相覆盖", async () => {
  const f = fixture({ contextPresets: legacy });
  const intents = {
    version: 1 as const,
    intents: [{ ...intentData.intents[0]!, name: "微信独立改名" }],
  };
  const savingIntent = f.intents.write("chat", intents);
  const savingBinding = f.bindings.write("chat", { version: 2, presets: [] });
  const savingMessage = f.wechat.write("chat", { version: 5, account: null, conversations: [] });
  assert.equal(f.submitted.length, 1);
  f.response.resolve(new Response(null, { status: 200 }));
  await Promise.all([savingIntent, savingBinding, savingMessage]);
  assert.deepEqual(f.intents.read("chat"), intents);
  assert.deepEqual(f.bindings.read("chat"), { version: 2, presets: [] });
  assert.equal(f.wechat.read("chat")?.version, 5);
  assert.equal(f.submitted.length, 3);
});

test("迁移拒绝未知来源、混合结构冲突和损坏数据，当前版本不再寻找旧条件", () => {
  assert.throws(
    () =>
      readPhoneIntentBlocks(
        { ...legacy, presets: [{ ...legacy.presets[0], sourceId: "other" }] },
        undefined,
      ),
    /来源无效/,
  );
  assert.throws(() => readPhoneIntentBlocks(legacy, intentData), /同时存在/);
  assert.throws(() => readPhoneIntentBlocks({ version: 999, presets: [] }, undefined), /格式无效/);
  assert.throws(() =>
    readPhoneIntentBlocks(
      {
        ...legacy,
        presets: [{ ...legacy.presets[0], selection: { ...selection, personIds: [] } }],
      },
      undefined,
    ),
  );
  assert.deepEqual(readPhoneIntentBlocks(binding, undefined), {
    contextPresets: binding,
    wechatIntents: { version: 1, intents: [] },
  });
});
