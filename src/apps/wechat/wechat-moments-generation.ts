import { Agent } from "@earendil-works/pi-agent-core";
import { createCompletionModel, runAgent } from "../../core/ai/agent-run.ts";
import type { AiTransport } from "../../core/ai/public.ts";
import type { ModelConnectionSnapshot } from "../settings/public.ts";

/** 每次显式动作仅一次模型调用，不注册工具，整次文本完成后才交给协议校验。 */
export async function generateMomentOutput(input: {
  transport: AiTransport;
  connection: ModelConnectionSnapshot;
  prompt: string;
  systemPrompt: string;
  operation: string;
  signal: AbortSignal;
}): Promise<string> {
  const stream = input.transport.createStream(input.connection, {
    app: "wechat",
    operation: input.operation,
  });
  const agent = new Agent({
    initialState: {
      model: createCompletionModel(input.connection.model),
      systemPrompt: input.systemPrompt,
      tools: [],
    },
    streamFn: (model, context, options) =>
      stream(model, context, { signal: options?.signal, maxTokens: 10240 }),
  });
  let toolError: Error | undefined;
  const { reply, timedOut } = await runAgent(agent, input.prompt, {
    signal: input.signal,
    timeoutMs: 300000,
    onEvent(event) {
      if (
        event.type === "message_end" &&
        event.message.role === "assistant" &&
        event.message.content.some((part) => part.type === "toolCall")
      ) {
        toolError = new Error("朋友圈未注册工具，模型返回了工具调用");
        agent.abort();
      }
    },
  });
  input.signal.throwIfAborted();
  if (toolError) {
    throw toolError;
  }
  if (timedOut) {
    throw new Error("朋友圈生成超时");
  }
  if (reply?.role !== "assistant") {
    throw new Error("模型未返回朋友圈内容");
  }
  if (reply.stopReason !== "stop") {
    throw new Error(
      reply.stopReason === "length" ? "朋友圈生成达到输出上限，未保存部分内容" : reply.errorMessage,
      { cause: reply.diagnostics },
    );
  }
  return reply.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}
