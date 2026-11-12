import assert from "node:assert/strict";
import { test } from "node:test";
import { registerPhoneContextMacro } from "./phone-context-macro.ts";
import type { StPhoneMacroContext, StPhoneMacroDefinition } from "./phone-context-macro.ts";

function fixture() {
  const registered = new Map<string, StPhoneMacroDefinition>();
  const errors: string[] = [];
  const context: StPhoneMacroContext = {
    macros: {
      register(name, definition) {
        registered.set(name, definition);
        return definition;
      },
      registry: { hasMacro: (name) => registered.has(name) },
    },
    powerUserSettings: { experimental_macro_engine: true },
  };
  return { context, registered, errors, report: (message: string) => errors.push(message) };
}

test("phone macro reads on every synchronous expansion, with one required preset argument", () => {
  const f = fixture();
  let saved = "first";
  const calls: string[] = [];
  registerPhoneContextMacro(
    () => f.context,
    (preset) => {
      calls.push(preset);
      return saved;
    },
    f.report,
  );
  assert.deepEqual(calls, []);
  const macro = f.registered.get("phone")!;
  assert.equal(macro.unnamedArgs.length, 1);
  assert.equal(macro.handler({ unnamedArgs: ["wechat_recent"] }), "first");
  saved = "second";
  assert.equal(macro.handler({ unnamedArgs: ["wechat_recent"] }), "second");
  saved = "";
  assert.equal(macro.handler({ unnamedArgs: ["wechat_recent"] }), "");
  assert.deepEqual(calls, ["wechat_recent", "wechat_recent", "wechat_recent"]);
  assert.deepEqual(f.errors, []);
});

test("a failed read is visible to the user and prompt, with macro delimiters neutralized", () => {
  const f = fixture();
  registerPhoneContextMacro(
    () => f.context,
    () => {
      throw new Error("预设 {{unknown}} 不存在");
    },
    f.report,
  );
  const value = f.registered.get("phone")!.handler({ unnamedArgs: ["unknown"] });
  assert.equal(value, "[手机上下文读取失败：预设 ｛｛unknown｝｝ 不存在]");
  assert.deepEqual(f.errors, ["手机上下文读取失败：预设 {{unknown}} 不存在"]);
});

test("unavailable new API and disabled engine report errors without stopping Phone initialization", () => {
  for (const context of [
    {},
    { ...fixture().context, powerUserSettings: { experimental_macro_engine: false } },
  ]) {
    const errors: string[] = [];
    assert.doesNotThrow(() =>
      registerPhoneContextMacro(
        () => context,
        () => assert.fail("must not expand"),
        (message) => errors.push(message),
      ),
    );
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /需要/);
  }
});

test("a conflicting macro is preserved and a rejected registration is surfaced", () => {
  const f = fixture();
  registerPhoneContextMacro(
    () => f.context,
    () => "original",
    f.report,
  );
  registerPhoneContextMacro(
    () => f.context,
    () => "replacement",
    f.report,
  );
  assert.equal(f.registered.get("phone")!.handler({ unnamedArgs: ["recent"] }), "original");
  assert.match(f.errors[0]!, /同名 phone 宏/);
  f.context.macros!.registry.hasMacro = () => false;
  f.context.macros!.register = () => null;
  registerPhoneContextMacro(
    () => f.context,
    () => "unused",
    f.report,
  );
  assert.match(f.errors[1]!, /拒绝注册/);
});
