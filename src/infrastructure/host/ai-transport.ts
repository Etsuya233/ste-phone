import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
} from "@earendil-works/pi-ai";
import type { AiConnection, AiTransport } from "../../core/ai/public.ts";
import { readOpenAiTextStream } from "./openai-text-stream.ts";
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

function safeFailure(error: unknown, connection: AiConnection): string {
  let message = error instanceof Error ? error.message : "模型请求失败";
  const credentials = [connection.apiKey, ...Object.values(connection.customHeaders)]
    .filter((value) => value.length > 0)
    .sort((left, right) => right.length - left.length);
  for (const credential of credentials) message = message.replaceAll(credential, "[隐藏]");
  return message.slice(0, 300);
}

export function createStAiTransport(
  getRequestHeaders: () => Record<string, string>,
  options: { fetchImpl?: typeof fetch } = {},
): AiTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  return {
    createStream(input) {
      const connection: AiConnection = {
        ...input,
        customHeaders: Object.fromEntries(
          Object.entries(input.customHeaders).map(([name, value]) => [
            name.toLowerCase() === "authorization" ? "Authorization" : name,
            value,
          ]),
        ),
      };
      return (requestModel, context, options) => {
        const signals = [
          options?.signal,
          options?.timeoutMs === undefined ? undefined : AbortSignal.timeout(options.timeoutMs),
        ].filter((value): value is AbortSignal => value !== undefined);
        const signal = AbortSignal.any(signals);
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
            signal.throwIfAborted();
            if (requestModel.api !== "openai-completions")
              throw new Error("模型传输仅支持 OpenAI Chat Completions");
            if (options?.reasoning || options?.thinkingBudgets)
              throw new Error("模型传输暂不支持思考内容");
            if (options?.apiKey !== undefined || options?.headers !== undefined)
              throw new Error("请通过连接快照提供模型鉴权和请求头");
            const response = await fetchImpl("/api/backends/chat-completions/generate", {
              method: "POST",
              headers: getRequestHeaders(),
              signal: signal,
              body: JSON.stringify({
                type: "normal",
                chat_completion_source: "custom",
                custom_url: connection.baseUrl,
                custom_include_headers: JSON.stringify({
                  Authorization: connection.apiKey ? `Bearer ${connection.apiKey}` : "",
                  ...connection.customHeaders,
                }),
                model: requestModel.id,
                messages: textMessages(context),
                stream: true,
                max_tokens: options?.maxTokens,
                temperature: options?.temperature,
              }),
            });
            if (!response.ok) throw new Error(`模型请求失败（HTTP ${response.status}）`);
            let previous = "";
            const completion = await readOpenAiTextStream(response, signal, (text) => {
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
            output.stopReason = signal.aborted ? "aborted" : "error";
            output.errorMessage = signal.aborted
              ? signal.reason instanceof DOMException && signal.reason.name === "TimeoutError"
                ? "模型请求超时"
                : "连接测试已取消"
              : safeFailure(error, connection);
            stream.push({ type: "error", reason: output.stopReason, error: output });
          }
        })();
        return stream;
      };
    },
  };
}
