import assert from "node:assert/strict";
import test from "node:test";
import { memoryDatabaseFixture } from "../../../tests/fixtures/memory-database.ts";
import { relatedBackgroundSnapshot } from "../../../tests/fixtures/related-background-snapshot.ts";
import { memorySnapshotFixture } from "../../../tests/fixtures/memory-snapshot.ts";
import type { MemorySnapshot } from "../../infrastructure/ste-memory/public-read-contract.ts";
import { MemoryDatabaseProvider } from "../../infrastructure/ste-memory/memory-database-provider.ts";
import { PhoneDataService } from "./data-service.ts";

function fixture(snapshot: MemorySnapshot = relatedBackgroundSnapshot(true)) {
  const memory = memoryDatabaseFixture(snapshot);
  memory.install();
  const provider = new MemoryDatabaseProvider();
  const data = new PhoneDataService(
    provider,
    {
      read: () => undefined,
      write: async () => {
        throw new Error("测试不写入人物资料");
      },
    },
    { getSnapshot: () => null, subscribe: () => () => {} },
    () => true,
  );
  const request = { ...data.getSnapshot().context, participantIds: ["red", "blue"] };
  return {
    memory,
    data,
    request,
    close() {
      data.dispose();
      memory.dispose();
    },
  };
}

test("related background maps stable identities before selecting either participant and retains direction", async () => {
  const f = fixture();
  try {
    const result = await f.data.readRelatedBackground(f.request);
    assert.deepEqual(
      result.relationships.map((item) => item.id),
      ["red-blue", "third-red"],
    );
    assert.deepEqual(result.relationships[1]!.characterA, { id: "another-red", name: "小红" });
    assert.deepEqual(result.relationships[1]!.characterB, { id: "red", name: "小红" });
    assert.match(result.relationships[0]!.description!, /小红信任小蓝；小蓝仍有顾虑/);
    assert.deepEqual(
      result.heldItems.map((item) => [item.id, item.holder.id]),
      [
        ["notebook", "blue"],
        ["red-bag", "red"],
      ],
    );
    assert.match(result.heldItems[1]!.description!, /所有权属于社团/);
    assert.deepEqual(
      result.importantEvents.map((item) => item.id),
      ["past-event", "reading"],
    );
    assert.match(result.importantEvents[1]!.outcome!, /延期/);
    assert.match(result.importantEvents[0]!.outcome!, /已经结束/);
    assert.deepEqual(
      result.importantEvents[1]!.characters.map((person) => person.id),
      ["blue", "another-red"],
    );
    assert.deepEqual(
      result.otherCharacters.map((person) => person.id),
      ["another-red"],
    );
    assert.equal(result.otherCharacters[0]!.background, "另一班的同名同学");
    assert.doesNotMatch(
      JSON.stringify(result),
      /instance-|远方关系事实|不应递归取到|无关钢笔|无人持有的钥匙/,
    );
    const queries = f.memory.stats.queries;
    assert.ok(queries.some((sql) => sql.includes("stable_record_id IN")));
    assert.ok(queries.some((sql) => sql.includes("character_b_id IN")));
  } finally {
    f.close();
  }
});

test("all record categories and third-party profiles paginate completely", async () => {
  const f = fixture();
  try {
    for (let index = 0; index < 205; index++) {
      f.memory.db
        .prepare(
          'INSERT INTO characters("$record_id","$stable_id","$created_at",name,background,current_status) VALUES (?,?,?,?,?,?)',
        )
        .run(`instance-extra-${index}`, `extra-${index}`, "later", `人物${index}`, "背景", null);
      f.memory.db
        .prepare(
          'INSERT INTO relationships("$record_id","$stable_id","$created_at",character_a,character_b,summary,key_facts) VALUES (?,?,?,?,?,?,?)',
        )
        .run(
          `r${index}`,
          `r${index}`,
          "later",
          "instance-red",
          `instance-extra-${index}`,
          "关系",
          null,
        );
      f.memory.db
        .prepare(
          'INSERT INTO items("$record_id","$stable_id","$created_at",name,owner,key_attributes,status) VALUES (?,?,?,?,?,?,?)',
        )
        .run(`i${index}`, `i${index}`, "later", `物品${index}`, "instance-blue", "描述", null);
      f.memory.db
        .prepare(
          'INSERT INTO important_events("$record_id","$stable_id","$created_at",name,details,related_characters) VALUES (?,?,?,?,?,?)',
        )
        .run(
          `e${index}`,
          `e${index}`,
          "later",
          `事件${index}`,
          "说明",
          JSON.stringify(["instance-red", `instance-extra-${index}`]),
        );
    }
    const result = await f.data.readRelatedBackground(f.request);
    assert.equal(result.relationships.length, 207);
    assert.equal(result.heldItems.length, 207);
    assert.equal(result.importantEvents.length, 207);
    assert.equal(result.otherCharacters.length, 206);
    for (const view of ["phone_relationships", "phone_items", "phone_important_events"]) {
      assert.equal(
        f.memory.stats.queries.filter((sql) => sql.includes(`FROM ${view} WHERE`)).length,
        2,
      );
    }
  } finally {
    f.close();
  }
});

test("empty optional records are normal and absent participants are explicit", async () => {
  const f = fixture(memorySnapshotFixture());
  try {
    assert.deepEqual(
      await f.data.readRelatedBackground({ ...f.request, participantIds: ["red"] }),
      { relationships: [], heldItems: [], importantEvents: [], otherCharacters: [] },
    );
    await assert.rejects(
      f.data.readRelatedBackground({ ...f.request, participantIds: ["missing"] }),
      /参与人物/,
    );
    await assert.rejects(
      f.data.readRelatedBackground({ ...f.request, participantIds: [] }),
      /至少/,
    );
  } finally {
    f.close();
  }
});

test("new capability absence or field mismatch does not affect existing background and summary", async () => {
  for (const mode of ["missing", "wrong-type", "wrong-target"] as const) {
    const base = memorySnapshotFixture();
    const snapshot: MemorySnapshot =
      mode === "missing"
        ? { ...base, tables: base.tables.filter((table) => table.key !== "relationships") }
        : {
            ...base,
            fields: base.fields.map((field) =>
              field.id !== "important_events.related_characters"
                ? field
                : mode === "wrong-type"
                  ? { ...field, type: "long_text" }
                  : { ...field, referenceTableId: "table-items" },
            ),
          };
    const f = fixture(snapshot);
    try {
      await assert.rejects(
        f.data.readRelatedBackground(f.request),
        mode === "missing"
          ? /relationships/
          : mode === "wrong-type"
            ? /类型不符/
            : /引用目标不兼容/,
      );
      assert.equal((await f.data.readBackground(f.request)).characters.length, 3);
      assert.match(await f.data.readSummary(f.request), /图书馆里的约定/);
      const schema = await f.data.describe(f.request);
      assert.ok(schema.objects.some((object) => object.name === "phone_chronicles"));
    } finally {
      f.close();
    }
  }
});

test("dangling direct character references and unexpected truncation fail explicitly", async () => {
  const f = fixture();
  try {
    f.memory.db.exec(
      "UPDATE relationships SET character_a='missing' WHERE \"$stable_id\"='third-red'",
    );
    await assert.rejects(f.data.readRelatedBackground(f.request), /不存在的人物/);
    const query = f.data.query.bind(f.data);
    f.data.query = async (request) => ({ ...(await query(request)), truncated: true });
    await assert.rejects(f.data.readRelatedBackground(f.request), /截断/);
  } finally {
    f.close();
  }
});
