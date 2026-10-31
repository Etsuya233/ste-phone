import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import type { AiTransport } from "../../src/core/ai/public.ts";

/** 预览复用设置的 Agent 流程，仅替换传输，始终不请求配置的模型服务。 */
export function createPreviewAiTransport(mode: string | null): AiTransport {
  return {
    createStream: () => (model, _context, options) => {
      const stream = createAssistantMessageEventStream();
      const output: AssistantMessage = {
        role: "assistant",
        content: [],
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
      stream.push({ type: "start", partial: output });
      const abort = () => {
        clearTimeout(timer);
        options?.signal?.removeEventListener("abort", abort);
        output.stopReason = "aborted";
        output.errorMessage = "连接测试已取消";
        stream.push({ type: "error", reason: "aborted", error: output });
      };
      const timer = setTimeout(
        () => {
          options?.signal?.removeEventListener("abort", abort);
          if (mode === "error") {
            output.stopReason = "error";
            output.errorMessage = "模拟测试失败：服务暂不可用，未请求真实服务";
            stream.push({ type: "error", reason: "error", error: output });
            return;
          }
          const text = `模拟回复：${model.id} 的预览测试完成，未请求真实服务。`;
          output.content = [{ type: "text", text: "" }];
          stream.push({ type: "text_start", contentIndex: 0, partial: output });
          output.content[0] = { type: "text", text };
          stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: output });
          stream.push({ type: "text_end", contentIndex: 0, content: text, partial: output });
          output.stopReason = mode === "length" ? "length" : "stop";
          stream.push({ type: "done", reason: output.stopReason, message: output });
        },
        mode === "slow" ? 15_000 : 600,
      );
      options?.signal?.addEventListener("abort", abort, { once: true });
      if (options?.signal?.aborted) abort();
      return stream;
    },
  };
}
