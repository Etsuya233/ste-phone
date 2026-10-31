import { Agent } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";
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
    const controller = new AbortController();
    let timedOut = false;
    const cancel = () => controller.abort();
    signal.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const model: Model<"openai-completions"> = {
      id: connection.model,
      name: connection.model,
      api: "openai-completions",
      provider: "ste-phone",
      baseUrl: "/api/backends/chat-completions",
      reasoning: false,
      input: ["text"],
      // Zero means undeclared metadata, never an inferred model capacity or price.
      contextWindow: 0,
      maxTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
    const stream = transport.createStream(connection);
    const agent = new Agent({
      initialState: { model, tools: [], systemPrompt: "Reply with a short greeting." },
      streamFn: (model, context, options) =>
        stream(model, context, { signal: options?.signal, maxTokens: 64 }),
    });
    const abortAgent = () => agent.abort();
    controller.signal.addEventListener("abort", abortAgent, { once: true });
    let streamedText = "";
    const unsubscribe = agent.subscribe((event) => {
      if (
        event.type === "message_update" &&
        event.message.role === "assistant" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        streamedText += event.assistantMessageEvent.delta;
        onText?.(streamedText);
      }
    });
    try {
      await agent.prompt("Hello.");
      const reply = agent.state.messages.at(-1);
      if (reply?.role !== "assistant") throw new Error("连接测试未收到模型回复");
      if (reply.stopReason === "error" || reply.stopReason === "aborted")
        throw new Error(timedOut ? "连接测试超时（60 秒）" : reply.errorMessage);
      const text = reply.content
        .map((block) => {
          if (block.type !== "text") throw new Error("连接测试收到非文本回复");
          return block.text;
        })
        .join("");
      return { text, truncated: reply.stopReason === "length" };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      controller.signal.removeEventListener("abort", abortAgent);
      unsubscribe();
    }
  };
}
