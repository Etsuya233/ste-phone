import assert from "node:assert/strict";
import { test } from "node:test";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import { NotesService } from "./notes-service.ts";
import { noteRoleKey, type NotesData, type NotesRole } from "./notes.ts";
import type { DataAppPublic, DataSourceSnapshot } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";

const role: NotesRole = { sourceId: "memory", scopeId: "space-a", id: "1", name: "同名角色" };
const otherRole: NotesRole = { ...role, scopeId: "space-b" };

function createService(write: (data: NotesData) => Promise<void>, stored: NotesData | null = null) {
  const data = {
    getSnapshot: () => ({ context: { available: false, message: "Memory 未连接" } }),
  } as DataAppPublic;
  return new NotesService({
    data,
    storage: { read: async () => stored, write },
    connections: {} as ModelConnectionsReader,
    transport: {
      createStream() {
        throw new Error("手动操作不应调用模型");
      },
    },
  });
}

test("写入确认前保留旧列表，失败后可用同一 ID 重试", async () => {
  let attempts = 0;
  const pending = Promise.withResolvers<void>();
  const service = createService(async () => {
    if (attempts++ === 0) {
      await pending.promise;
    }
  });
  await service.load();
  const input = { id: "draft", role, blocks: [{ type: "paragraph" as const, text: "一段文字" }] };
  const saving = service.saveNote(input);
  assert.equal(service.getSnapshot().saving, true);
  assert.deepEqual(service.getSnapshot().data.entries, []);
  await assert.rejects(service.selectRole(otherRole), /正在保存/);
  pending.reject(new Error("写入失败"));
  await assert.rejects(saving, /写入失败/);
  assert.deepEqual(service.getSnapshot().data.entries, []);
  assert.equal(service.getSnapshot().saving, false);
  await service.saveNote(input);
  assert.deepEqual(
    service.getSnapshot().data.entries.map(({ id }) => id),
    ["draft"],
  );
});

test("Memory 不可用时仍提供历史笔记角色和最后所选角色", async () => {
  const timestamp = "2026-11-12T00:00:00.000Z";
  const service = createService(async () => {}, {
    version: 1,
    lastRole: otherRole,
    entries: [
      {
        id: "saved",
        role,
        createdAt: timestamp,
        updatedAt: timestamp,
        blocks: [{ type: "paragraph", text: "旧笔记" }],
      },
    ],
  });
  await service.load();
  const result = await service.readRoles();
  assert.equal(result.error, "Memory 未连接");
  assert.deepEqual(result.roles.map(noteRoleKey), [noteRoleKey(role), noteRoleKey(otherRole)]);
  assert.equal(service.getSnapshot().data.lastRole, otherRole);
});

test("写作按角色和当前聊天取材，拒绝其他资料空间和取材期间切换聊天", async () => {
  const scope = { chatIdentity: "memory-chat", scopeId: "current-instance" };
  const snapshot: DataSourceSnapshot = {
    context: {
      ...scope,
      available: true,
      sourceName: "Memory",
      chatName: "当前聊天",
      spaceName: "当前剧情",
      message: null,
    },
    hostChatId: "st-chat",
    sourceId: role.sourceId,
    status: "idle",
    data: null,
    stale: false,
    error: null,
    loadedAt: null,
    revision: 0,
  };
  let hostChatId = snapshot.hostChatId;
  let switchDuringRead = false;
  const second = { ...role, id: "2" };
  const prompts: string[] = [];
  const service = new NotesService({
    storage: { read: async () => null, write: async () => assert.fail("生成不应写入笔记") },
    data: {
      getSnapshot: () => ({ ...snapshot, hostChatId }),
      subscribe: () => () => {},
      describe: async () => ({
        sourceId: role.sourceId,
        scopeId: scope.scopeId,
        stableScopeId: role.scopeId,
        name: "当前剧情",
        schemaVersion: 1,
        schemaKey: "schema",
        databaseKey: "db",
        objects: [],
      }),
      readBackground: async () => assert.fail("只读取写作所需资料"),
      readRelatedBackground: async () => assert.fail("只读取写作所需资料"),
      query: async () => assert.fail("应通过资料应用读取剧情"),
      readCharacters: async (request, ids) => {
        assert.deepEqual(request, scope);
        return (ids ?? []).map((id) => ({ id, name: role.name, profileText: `角色档案-${id}` }));
      },
      readSummary: async () => "书已经借出",
      readWorldState: async () => [{ worldTime: "2026-10-30", location: "图书馆", weather: null }],
      readRecentChat: async (request) => {
        assert.deepEqual(request, { ...scope, count: 10 });
        if (switchDuringRead) {
          hostChatId = "other-st-chat";
        }
        return {
          chatIdentity: scope.chatIdentity,
          cleaning: { enabled: true, ruleId: "clean", ruleName: "正文" },
          messages: [{ floor: 4, name: "旁白", role: "narrator", content: "她把伞放在门口" }],
        };
      },
    },
    connections: {
      getSnapshot: () => ({ connections: [], defaultModelConnectionId: "model" }),
      getConnection: () => ({
        id: "model",
        name: "模拟",
        model: "mock",
        baseUrl: "https://example.invalid",
        apiKey: "",
        customHeaders: {},
      }),
      subscribe: () => () => {},
    },
    transport: {
      createStream: () => (model, context) => {
        prompts.push(JSON.stringify([context.systemPrompt, context.messages]));
        const stream = createAssistantMessageEventStream();
        const message: AssistantMessage = {
          role: "assistant",
          content: [{ type: "text", text: "写好了一段文字" }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          timestamp: Date.now(),
          stopReason: "stop",
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
        };
        stream.push({ type: "done", reason: "stop", message });
        return stream;
      },
    },
  });
  const write = (author: NotesRole) =>
    service.generate(author, "写待办", new AbortController().signal, () => {});
  assert.equal(await write(role), "写好了一段文字");
  assert.equal(await write(second), "写好了一段文字");
  assert.match(prompts[0]!, /角色档案-1/);
  assert.doesNotMatch(prompts[0]!, /角色档案-2/);
  assert.match(prompts[1]!, /角色档案-2/);
  for (const prompt of prompts) {
    assert.match(prompt, /写待办/);
    assert.match(prompt, /书已经借出/);
    assert.match(prompt, /图书馆/);
    assert.match(prompt, /她把伞放在门口/);
  }
  await assert.rejects(write(otherRole), /当前剧情/);
  switchDuringRead = true;
  await assert.rejects(write(role), /取材期间聊天或资料空间已变化/);
  assert.equal(prompts.length, 2);
});
