export interface StPhoneMacroDefinition {
  description: string;
  category: string;
  unnamedArgs: readonly { name: string; description: string }[];
  exampleUsage: string;
  handler(context: { unnamedArgs: readonly string[] }): string;
}

export interface StPhoneMacroContext {
  /** Older ST installations can still run Phone; only this optional integration is unavailable. */
  macros?: {
    register(name: string, definition: StPhoneMacroDefinition): unknown;
    registry: { hasMacro(name: string): boolean };
  };
  powerUserSettings?: { experimental_macro_engine?: boolean };
}

/** Registers once for the extension lifetime, independently of the Phone window and App pages. */
export function registerPhoneContextMacro(
  getContext: () => StPhoneMacroContext,
  expand: (presetId: string) => string,
  reportError: (message: string) => void,
): void {
  try {
    const context = getContext();
    if (!context.macros) {
      throw new Error("手机上下文宏需要支持 macros.register 的 ST 版本，请更新 ST");
    }
    if (context.powerUserSettings?.experimental_macro_engine === false) {
      throw new Error("手机上下文宏需要开启 ST 的 Experimental Macro Engine，开启后请刷新页面");
    }
    if (context.macros.registry.hasMacro("phone")) {
      throw new Error("ST 已注册同名 phone 宏，无法注册手机上下文宏");
    }
    const registered = context.macros.register("phone", {
      category: "chat",
      description: "同步读取当前聊天中 ST 宏绑定引用的 App Intent",
      unnamedArgs: [{ name: "preset", description: "手机设置 → ST 接入中已保存的宏标识" }],
      exampleUsage: "{{phone::wechat_recent}}",
      handler: ({ unnamedArgs }) => {
        try {
          return expand(unnamedArgs[0]!);
        } catch (failure) {
          // ST catches thrown handlers and keeps the raw macro. Surface the failure to the
          // user and in the expanded prompt so it cannot be mistaken for an empty result.
          const message = failure instanceof Error ? failure.message : String(failure);
          reportError(`手机上下文读取失败：${message}`);
          return `[手机上下文读取失败：${message.replaceAll("{", "｛").replaceAll("}", "｝")}]`;
        }
      },
    });
    // ST reports invalid registrations with null instead of throwing.
    if (registered === null) {
      throw new Error("ST 拒绝注册 phone 宏，请查看 ST 控制台的宏注册错误");
    }
  } catch (failure) {
    reportError(failure instanceof Error ? failure.message : String(failure));
  }
}
