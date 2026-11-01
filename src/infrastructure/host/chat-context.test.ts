import assert from "node:assert/strict";
import { test } from "node:test";
import { createStChatContext } from "./chat-context.ts";
import type { StChatContext } from "./chat-context.ts";

function fixture() {
  const handlers = new Map<string, Set<() => void>>();
  const context: StChatContext = {
    chatId: "story",
    characterId: 0,
    groupId: null,
    characters: [{ avatar: "alice.png" }],
    eventTypes: {
      CHAT_CHANGED: "changed",
      CHAT_RENAMED: "renamed",
      CHARACTER_RENAMED: "character",
      GROUP_UPDATED: "group",
    },
    eventSource: {
      on: (event, listener) => {
        if (!handlers.has(event)) {
          handlers.set(event, new Set());
        }
        handlers.get(event)!.add(listener);
      },
      removeListener: (event, listener) => {
        handlers.get(event)!.delete(listener);
      },
    },
  };
  const chat = createStChatContext(() => context);
  return {
    context,
    chat,
    emit: (event: string) => {
      for (const handler of handlers.get(event)!) {
        handler();
      }
    },
  };
}

test("snapshot is stable and notifications observe updated chat without Memory", () => {
  const { context, chat, emit } = fixture();
  const original = chat.getSnapshot();
  assert.equal(chat.getSnapshot(), original);
  let notified = 0;
  const unsubscribe = chat.subscribe(() => {
    notified++;
    assert.equal(chat.getSnapshot()!.name, "next");
  });
  emit("changed");
  assert.equal(notified, 0);
  context.chatId = "next";
  emit("changed");
  assert.equal(notified, 1);
  assert.notEqual(chat.getSnapshot()!.id, original!.id);
  unsubscribe();
  context.chatId = undefined;
  emit("changed");
  assert.equal(chat.getSnapshot(), null);
  chat.dispose();
});

test("file rename, copy, group switch and owner identity remain distinct", () => {
  const { context, chat, emit } = fixture();
  const original = chat.getSnapshot()!;
  context.characters = [{ avatar: "other.png" }, { avatar: "alice.png" }];
  context.characterId = 1;
  emit("changed");
  assert.equal(chat.getSnapshot(), original);
  context.chatId = "renamed";
  emit("renamed");
  assert.notEqual(chat.getSnapshot()!.id, original.id);
  context.chatId = "story";
  context.groupId = "alice.png";
  emit("changed");
  assert.notEqual(chat.getSnapshot()!.id, original.id);
  context.groupId = null;
  context.characterId = undefined;
  emit("changed");
  assert.equal(chat.getSnapshot(), null);
  chat.dispose();
  context.chatId = "disposed";
  emit("changed");
  assert.equal(chat.getSnapshot(), null);
});
