import assert from "node:assert/strict";
import test from "node:test";
import { migrateData } from "./migrations.ts";
import type { MigrationPlan, MigrationStep } from "./migrations.ts";

interface Data {
  version: 7;
  notes: string[];
}

function validate(data: unknown): asserts data is Data {
  const value = data as Data;
  assert.equal(value.version, 7);
  assert.ok(Array.isArray(value.notes));
  assert.ok(value.notes.every((note) => typeof note === "string"));
}

const plan: MigrationPlan<Data> = {
  currentVersion: 7,
  steps: [
    {
      from: 6,
      to: 7,
      name: "append-last-note",
      migrate(data) {
        const value = data as { version: number; notes: string[] };
        assert.equal(value.version, 6);
        value.notes.push("最后一步");
        return value;
      },
    },
    {
      from: 1,
      to: 6,
      name: "collect-old-note",
      migrate(data) {
        const value = data as { version: number; note: string };
        assert.equal(value.version, 1);
        return { notes: [value.note] };
      },
    },
  ],
  validate,
};

test("迁移按版本路径执行跳跃步骤，统一推进版本并记录执行顺序", () => {
  const raw = { version: 1, note: "旧备注" };
  assert.deepEqual(migrateData(raw, plan), {
    data: { version: 7, notes: ["旧备注", "最后一步"] },
    executed: [
      { from: 1, to: 6, name: "collect-old-note" },
      { from: 6, to: 7, name: "append-last-note" },
    ],
  });
  assert.deepEqual(raw, { version: 1, note: "旧备注" });
});

test("当前版本仍校验，返回数据与原输入完全隔离", () => {
  const raw: Data = { version: 7, notes: ["已有备注"] };
  const result = migrateData(raw, plan);
  assert.deepEqual(result.executed, []);
  result.data.notes.push("新备注");
  assert.deepEqual(raw.notes, ["已有备注"]);
  assert.throws(() => migrateData({ version: 7, notes: [4] }, plan));
});

test("缺数据、损坏对象、非法版本和未来版本直接报错", () => {
  class NonJsonData {
    version = 1;
  }
  for (const raw of [
    undefined,
    null,
    [],
    new Date(),
    new NonJsonData(),
    {},
    { version: "1" },
    { version: 0 },
    { version: -1 },
    { version: 1.5 },
    { version: Infinity },
    { version: Number.MAX_SAFE_INTEGER + 1 },
    { version: 8 },
  ]) {
    assert.throws(() => migrateData(raw, plan));
  }
  assert.throws(() => migrateData({ version: 2 }, plan), /缺少.*迁移路径/);
});

test("在处理数据前拒绝重复起点、无效定义与所有已登记的断链", () => {
  const validStep = plan.steps[0]!;
  const invalidSteps: readonly MigrationStep[][] = [
    [validStep, { ...validStep, name: "重复起点" }],
    [{ ...validStep, from: 0 }],
    [{ ...validStep, from: 6.5 }],
    [{ ...validStep, to: 6 }],
    [{ ...validStep, to: 5 }],
    [{ ...validStep, to: 8 }],
    [{ ...validStep, to: 6.5 }],
    [{ ...validStep, name: " " }],
    [{ ...validStep, from: 1, to: 5 }],
  ];
  for (const steps of invalidSteps) {
    assert.throws(() => migrateData({ version: 7, notes: [] }, { ...plan, steps }));
  }
  for (const currentVersion of [0, 1.5, Infinity]) {
    assert.throws(() =>
      migrateData({ version: 7, notes: [] }, {
        ...plan,
        currentVersion,
      } as MigrationPlan<{ version: number }>),
    );
  }
});

test("步骤失败保留原因和迁移身份，任何失败均不改变原输入", () => {
  const raw = { version: 6, notes: ["已有备注"] };
  const original = structuredClone(raw);
  const cause = new Error("转换失败");
  const steps: readonly MigrationStep[] = [
    {
      ...plan.steps[0]!,
      migrate(data) {
        (data as typeof raw).notes.push("不应泄漏的修改");
        throw cause;
      },
    },
  ];
  assert.throws(
    () => migrateData(raw, { ...plan, steps }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /append-last-note.*6.*7/);
      assert.match(error.message, /转换失败/);
      assert.equal(error.cause, cause);
      return true;
    },
  );
  assert.deepEqual(raw, original);
  assert.throws(() =>
    migrateData(raw, {
      ...plan,
      validate() {
        throw new Error("最终校验失败");
      },
    }),
  );
  assert.deepEqual(raw, original);
});

test("损坏的步骤输出在继续执行前报错", () => {
  let laterCalled = false;
  for (const result of [undefined, null, [], "错误内容", new Date()]) {
    assert.throws(
      () =>
        migrateData(
          { version: 1 },
          {
            ...plan,
            steps: [
              { from: 1, to: 6, name: "损坏输出", migrate: () => result },
              {
                from: 6,
                to: 7,
                name: "不应执行",
                migrate: () => {
                  laterCalled = true;
                  return { notes: [] };
                },
              },
            ],
          },
        ),
      /损坏输出/,
    );
  }
  assert.equal(laterCalled, false);
});
