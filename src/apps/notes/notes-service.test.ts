import assert from "node:assert/strict";
import { test } from "node:test";
import { NotesService } from "./notes-service.ts";
import { noteRoleKey, type NotesData, type NotesRole } from "./notes.ts";
import type { DataAppPublic } from "../data-source/public.ts";
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
