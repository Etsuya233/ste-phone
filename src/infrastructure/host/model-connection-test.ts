import { Agent } from "@earendil-works/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
  type Model,
} from "@earendil-works/pi-ai";
import {
  connectionUpstreamHeaders,
  validateModelConnection,
  type ModelConnection,
} from "../../features/settings/model-connections.ts";
import { readOpenAiTextStream, type TextCompletion } from "./openai-text-stream.ts";

export type TestModelConnection = (
  connection: ModelConnection,
  signal: AbortSignal,
  onText?: (text: string) => void,
) => Promise<TextCompletion>;

interface ConnectionTestOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

function textMessages(context: Context) {
  if (context.tools?.length) throw new Error("连接测试暂不支持工具");
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [];
  if (context.systemPrompt) messages.push({ role: "system", content: context.systemPrompt });
  for (const message of context.messages) {
    if (message.role !== "user" && message.role !== "assistant")
      throw new Error("连接测试暂不支持工具消息");
    const content =
      typeof message.content === "string"
        ? message.content
        : message.content
            .map((block) => {
              if (block.type !== "text") throw new Error("连接测试仅支持文本消息");
              return block.text;
            })
            .join("");
    messages.push({ role: message.role, content });
  }
  return messages;
}

function safeFailure(error: unknown, connection: ModelConnection): string {
  let message = error instanceof Error ? error.message : "模型请求失败";
  const credentials = [connection.apiKey, ...Object.values(connection.customHeaders)]
    .filter((value) => value.length > 0)
    .sort((left, right) => right.length - left.length);
  for (const credential of credentials) message = message.replaceAll(credential, "[隐藏]");
  return message.slice(0, 300);
}

/** A connection test owns one Pi Agent and never reads the host's current model settings. */
export function createStModelConnectionTest(
  getRequestHeaders: () => Record<string, string>,
  options: ConnectionTestOptions = {},
): TestModelConnection {
  const fetchImpl = options.fetchImpl ?? fetch;
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
    const agent = new Agent({
      initialState: { model, tools: [], systemPrompt: "Reply with a short greeting." },
      streamFn: (requestModel, context) => {
        const stream = createAssistantMessageEventStream();
        const output: AssistantMessage = {
          role: "assistant",
          content: [],
          api: requestModel.api,
          provider: requestModel.provider,
          model: requestModel.id,
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
        void (async () => {
          try {
            controller.signal.throwIfAborted();
            const response = await fetchImpl("/api/backends/chat-completions/generate", {
              method: "POST",
              headers: getRequestHeaders(),
              signal: controller.signal,
              body: JSON.stringify({
                type: "normal",
                chat_completion_source: "custom",
                custom_url: connection.baseUrl,
                custom_include_headers: connectionUpstreamHeaders(connection),
                model: requestModel.id,
                messages: textMessages(context),
                stream: true,
                max_tokens: 64,
              }),
            });
            if (!response.ok) throw new Error(`模型请求失败（HTTP ${response.status}）`);
            let previous = "";
            const completion = await readOpenAiTextStream(response, controller.signal, (text) => {
              const delta = text.slice(previous.length);
              if (output.content.length === 0) {
                output.content.push({ type: "text", text: "" });
                stream.push({ type: "text_start", contentIndex: 0, partial: output });
              }
              output.content[0] = { type: "text", text };
              previous = text;
              stream.push({ type: "text_delta", contentIndex: 0, delta, partial: output });
            });
            stream.push({
              type: "text_end",
              contentIndex: 0,
              content: completion.text,
              partial: output,
            });
            output.stopReason = completion.truncated ? "length" : "stop";
            stream.push({ type: "done", reason: output.stopReason, message: output });
          } catch (error) {
            output.stopReason = controller.signal.aborted ? "aborted" : "error";
            output.errorMessage = timedOut
              ? "连接测试超时（60 秒）"
              : controller.signal.aborted
                ? "连接测试已取消"
                : safeFailure(error, connection);
            stream.push({ type: "error", reason: output.stopReason, error: output });
          }
        })();
        return stream;
      },
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
        throw new Error(reply.errorMessage);
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
