import type { TestModelConnection } from "../../src/infrastructure/host/model-connection-test.ts";
import { validateModelConnection } from "../../src/features/settings/model-connections.ts";

// Preview never contacts a configured service, even when a real-looking URL is entered.
export function createPreviewModelConnectionTest(mode: string | null): TestModelConnection {
  return async (connection, signal, onText) => {
    validateModelConnection(connection);
    signal.throwIfAborted();
    await new Promise<void>((accept, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(
        () => {
          signal.removeEventListener("abort", onAbort);
          accept();
        },
        mode === "slow" ? 15_000 : 600,
      );
      signal.addEventListener("abort", onAbort, { once: true });
    });
    if (mode === "error") throw new Error("模拟测试失败：服务暂不可用，未请求真实服务");
    const text = `模拟回复：${connection.model} 的预览测试完成，未请求真实服务。`;
    onText?.(text);
    return { text, truncated: mode === "length" };
  };
}
