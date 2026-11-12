import assert from "node:assert/strict";
import test from "node:test";
import { memoryDatabaseFixture } from "../../../tests/fixtures/memory-database.ts";
import { relatedBackgroundSnapshot } from "../../../tests/fixtures/related-background-snapshot.ts";
import { MemoryDatabaseProvider } from "../../infrastructure/ste-memory/memory-database-provider.ts";
import { PhoneDataService } from "./data-service.ts";
import type { CharacterOverrides } from "./character-overrides.ts";

test("person overrides preserve source order, ownership and the previous effective snapshot", async () => {
  const memory = memoryDatabaseFixture(relatedBackgroundSnapshot(true));
  memory.install();
  const provider = new MemoryDatabaseProvider();
  let chatId = "st-chat-a";
  let notify = () => {};
  let fail = false;
  const saved = new Map<string, CharacterOverrides>();
  const data = new PhoneDataService(
    provider,
    {
      read: (id) => saved.get(id),
      async write(id, value, assertCurrent) {
        assertCurrent?.();
        if (fail) {
          throw new Error("测试保存失败");
        }
        saved.set(id, value);
      },
    },
    {
      getSnapshot: () => ({ id: chatId, name: chatId }),
      subscribe: (listener) => {
        notify = listener;
        return () => {};
      },
    },
    (memoryChat) => "st-" + memoryChat === chatId,
  );
  try {
    const scope = data.getSnapshot().context;
    const previous = await data.readBackground(scope);
    const source = previous.characters.find(({ id }) => id === "red")!;
    const rawRevision = data.getSnapshot().revision;
    await data.saveCharacter(scope, chatId, "red", {
      name: " 新小红 ",
      current_status: "",
      avatar: { id: "portrait", imagePath: "/images/portrait.png" },
    });
    assert.equal(data.getSnapshot().revision, rawRevision);
    assert.equal(data.getSnapshot().characterRevision, 1);
    const background = await data.readBackground(scope);
    const person = background.characters.find(({ id }) => id === "red")!;
    assert.equal(person.name, "新小红");
    assert.equal(person.avatar?.id, "portrait");
    assert.deepEqual(
      person.fields?.map(({ key }) => key),
      source.fields?.map(({ key }) => key),
    );
    assert.equal(person.fields?.find(({ key }) => key === "current_status")?.value, "");
    assert.match(person.profileText, /name：新小红\naliases：文学社小红/);
    assert.doesNotMatch(person.profileText, /current_status/);
    assert.equal(background.characters.find(({ id }) => id === "another-red")?.name, "小红");
    assert.equal(source.name, "小红");
    assert.equal(
      (
        await data.query({
          ...scope,
          sql: "SELECT name FROM phone_characters WHERE stable_record_id = 'red'",
        })
      ).rows[0]?.[0],
      "小红",
    );
    const related = await data.readRelatedBackground({ ...scope, participantIds: ["blue"] });
    assert.equal(related.relationships[0]?.characterA.name, "新小红");

    memory.db.exec(
      "UPDATE characters SET current_status = '来源最新近况' WHERE \"$stable_id\" = 'red'",
    );
    memory.change();
    fail = true;
    await assert.rejects(
      data.saveCharacter(scope, chatId, "red", { current_status: null }),
      /保存失败/,
    );
    assert.equal(
      (await data.readCharacters(scope, ["red"]))[0]?.fields?.find(
        ({ key }) => key === "current_status",
      )?.value,
      "",
    );
    fail = false;
    await data.saveCharacter(scope, chatId, "red", { current_status: null });
    assert.match((await data.readCharacters(scope, ["red"]))[0]!.profileText, /来源最新近况/);

    chatId = "st-chat-b";
    notify();
    assert.equal(data.getSnapshot().data, null);
    await assert.rejects(data.readCharacters(scope), /切换聊天资料/);
    memory.change({ chatIdentity: "chat-b" });
    const second = data.getSnapshot().context;
    assert.equal((await data.readCharacters(second, ["red"]))[0]?.name, "小红");
    await assert.rejects(
      data.saveCharacter(scope, "st-chat-a", "red", { name: "不能跨聊" }),
      /聊天已变化/,
    );
    memory.change({ chatIdentity: "chat-a" });
    const returning = data.getSnapshot().context;
    assert.equal(data.getSnapshot().data, null);
    await assert.rejects(data.readCharacters(returning), /切换聊天资料/);
    chatId = "st-chat-a";
    notify();
    assert.equal((await data.readCharacters(returning, ["red"]))[0]?.name, "新小红");
    assert.equal(saved.size, 1);
  } finally {
    data.dispose();
    memory.dispose();
  }
});
