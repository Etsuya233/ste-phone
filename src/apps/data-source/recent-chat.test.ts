import assert from "node:assert/strict";
import { test } from "node:test";
import { PhoneDataService } from "./data-service.ts";
import type { DatabaseProvider } from "./ports/database-provider.ts";
import type { SourceContext } from "./ports/background-provider.ts";
import type { RecentChatSnapshot } from "./public.ts";

function fixture(readRecentChat?: DatabaseProvider["readRecentChat"]) {
  let context: SourceContext = {
    sourceName: "Memory",
    chatIdentity: "memory-chat",
    chatName: "聊天",
    scopeId: "space",
    spaceName: "空间",
    available: true,
    message: null,
  };
  const listeners = new Set<() => void>();
  const service = new PhoneDataService({
    getContext: () => context,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    describe: async () => {
      throw new Error("聊天读取不应加载 SQL 结构");
    },
    register: async () => {
      throw new Error("聊天读取不应注册视图");
    },
    query: async () => {
      throw new Error("聊天读取不应执行 SQL");
    },
    readRecentChat,
  });
  return {
    service,
    request: { chatIdentity: "memory-chat", scopeId: "space", count: 20 },
    change(chatIdentity: string) {
      context = { ...context, chatIdentity };
      for (const listener of listeners) listener();
    },
  };
}

test("recent chat preserves source cleaning and returns a fixed caller snapshot without SQL", async () => {
  const messages = [{ floor: 8, name: "角色", role: "assistant" as const, content: "清洗后正文" }];
  let count: number | undefined;
  const f = fixture(async (requestedCount) => {
    count = requestedCount;
    return {
      chatIdentity: "memory-chat",
      messages,
      cleaning: { enabled: true, ruleId: "rule", ruleName: "正文" },
    };
  });
  try {
    const result = await f.service.readRecentChat(f.request);
    assert.equal(count, 20);
    messages[0]!.content = "后续变化";
    assert.equal(result.messages[0]!.content, "清洗后正文");
    assert.equal(result.cleaning.ruleName, "正文");
    assert.ok(Object.isFrozen(result.messages[0]));
    await assert.rejects(
      f.service.readRecentChat({ ...f.request, chatIdentity: "core-chat-id" }),
      /聊天已变化/,
    );
  } finally {
    f.service.dispose();
  }
});

test("recent chat rejects missing capability, failed reads and late results after switching away and back", async () => {
  const unavailable = fixture();
  await assert.rejects(unavailable.service.readRecentChat(unavailable.request), /缺少清洗聊天/);
  unavailable.service.dispose();

  const failed = fixture(async () => {
    throw new Error("清洗规则已不存在");
  });
  await assert.rejects(failed.service.readRecentChat(failed.request), /规则已不存在/);
  failed.service.dispose();

  let complete!: (snapshot: RecentChatSnapshot) => void;
  const f = fixture(() => new Promise((done) => (complete = done)));
  const pending = f.service.readRecentChat(f.request);
  f.change("other-chat");
  f.change("memory-chat");
  complete({
    chatIdentity: "memory-chat",
    messages: [],
    cleaning: { enabled: false, ruleId: null, ruleName: null },
  });
  await assert.rejects(pending, /聊天已变化/);
  f.service.dispose();
});
