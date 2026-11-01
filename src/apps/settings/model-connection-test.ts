import { Agent } from "@earendil-works/pi-agent-core";
import { createCompletionModel, runAgent } from "../../core/ai/agent-run.ts";
import type { AiTransport } from "../../core/ai/public.ts";
import { validateModelConnection, type ModelConnection } from "./model-connections.ts";
export interface TextCompletion {
  text: string;
  truncated: boolean;
}
export type TestModelConnection = (
  connection: ModelConnection,
  signal: AbortSignal,
  onText?: (text: string) => void,
) => Promise<TextCompletion>;
interface ConnectionTestOptions {
  timeoutMs?: number;
}
/** A connection test owns one Pi Agent and never reads the host's current model settings. */
export function createModelConnectionTest(
  transport: AiTransport,
  options: ConnectionTestOptions = {},
): TestModelConnection {
  const timeoutMs = options.timeoutMs ?? 60_000;
  return async (input, signal, onText) => {
    signal.throwIfAborted();
    const connection = validateModelConnection({
      ...input,
      customHeaders: { ...input.customHeaders },
    });
    const stream = transport.createStream(connection, { operation: "连接测试" });
    const agent = new Agent({
      initialState: {
        model: createCompletionModel(connection.model),
        tools: [],
        systemPrompt: "Reply with a short greeting.",
      },
      streamFn: (model, context, options) =>
        stream(model, context, { signal: options?.signal, maxTokens: 64 }),
    });
    let streamedText = "";
    let toolFailure: Error | undefined;
    const { reply, timedOut } = await runAgent(agent, "Hello.", {
      signal,
      timeoutMs,
      onEvent(event) {
        if (event.type === "message_end" && event.message.role === "assistant") {
          const calls = event.message.content.filter((block) => block.type === "toolCall");
          if (calls.length) {
            toolFailure = new Error(
              `连接测试未注册工具，收到工具调用：${calls.map((call) => call.name).join("、")}`,
              { cause: event.message },
            );
            agent.abort();
          }
        }
        if (
          event.type === "message_update" &&
          event.message.role === "assistant" &&
          event.assistantMessageEvent.type === "text_delta"
        ) {
          streamedText += event.assistantMessageEvent.delta;
          onText?.(streamedText);
        }
      },
    });
    if (toolFailure) {
      throw toolFailure;
    }
    if (reply?.role !== "assistant") {
      throw new Error("连接测试未收到模型回复");
    }
    if (reply.stopReason === "error" || reply.stopReason === "aborted") {
      throw new Error(
        timedOut
          ? `连接测试超时（${timeoutMs / 1000} 秒）：${reply.errorMessage}`
          : reply.errorMessage,
        { cause: reply.diagnostics },
      );
    }
    const text = reply.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    if (!text.trim()) {
      throw new Error("连接测试收到空回复", { cause: reply });
    }
    return { text, truncated: reply.stopReason === "length" };
  };
}
