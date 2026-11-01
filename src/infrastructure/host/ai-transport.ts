import {
  createAssistantMessageEventStream,
  createAssistantMessageDiagnostic,
  formatThrownValue,
  type AssistantMessage,
  type Context,
} from "@earendil-works/pi-ai";
import type { AiConnection, AiTransport } from "../../core/ai/public.ts";
import { readOpenAiStream, type StreamEventSummary } from "./openai-stream.ts";
let requestSequence = 0;
function completionMessages(context: Context) {
  const messages: Record<string, unknown>[] = [];
  if (context.systemPrompt) {
    messages.push({ role: "system", content: context.systemPrompt });
  }
  for (const message of context.messages) {
    if (message.role === "assistant") {
      if (message.stopReason === "error" || message.stopReason === "aborted") {
        continue;
      }
      const content = message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
      const thinking = message.content
        .filter((block) => block.type === "thinking")
        .map((block) => block.thinking)
        .join("");
      const calls = message.content.filter((block) => block.type === "toolCall");
      messages.push({
        role: "assistant",
        content,
        ...(thinking ? { reasoning_content: thinking } : {}),
        ...(calls.length
          ? {
              tool_calls: calls.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.arguments) },
              })),
            }
          : {}),
      });
    } else {
      const content =
        typeof message.content === "string"
          ? message.content
          : message.content.every((block) => block.type === "text")
            ? message.content.map((block) => block.text).join("\n")
            : message.content.map((block) =>
                block.type === "text"
                  ? { type: "text", text: block.text }
                  : {
                      type: "image_url",
                      image_url: { url: `data:${block.mimeType};base64,${block.data}` },
                    },
              );
      messages.push({
        role: message.role === "toolResult" ? "tool" : "user",
        content,
        ...(message.role === "toolResult" ? { tool_call_id: message.toolCallId } : {}),
      });
    }
  }
  return messages;
}

export function createStAiTransport(
  getRequestHeaders: () => Record<string, string>,
  options: {
    fetchImpl?: typeof fetch;
    log?: (entry: Readonly<Record<string, unknown>>) => void;
  } = {},
): AiTransport {
  const fetchImpl = options.fetchImpl ?? fetch;
  const log =
    options.log ??
    ((entry: Readonly<Record<string, unknown>>) => console.info("[STE Phone AI]", entry));
  return {
    createStream(input, diagnostics) {
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
        const requestId = `phone-ai-${++requestSequence}`;
        const startedAt = performance.now();
        let stage = "prepare";
        let streamEvent: StreamEventSummary | undefined;
        let textCharacters = 0;
        let responseStatus: number | undefined;
        let responseBody: string | undefined;
        const record = (event: string, details: Readonly<Record<string, unknown>>) =>
          log({
            requestId,
            operation: diagnostics?.operation ?? "模型请求",
            event,
            elapsedMs: Math.round(performance.now() - startedAt),
            ...details,
          });
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
            if (requestModel.api !== "openai-completions") {
              throw new Error("模型传输仅支持 OpenAI Chat Completions");
            }
            if (options?.apiKey !== undefined || options?.headers !== undefined) {
              throw new Error("请通过连接快照提供模型鉴权和请求头");
            }
            const messages = completionMessages(context);
            stage = "request";
            record("request", {
              endpoint: "/api/backends/chat-completions/generate",
              baseUrl: connection.baseUrl,
              model: requestModel.id,
              maxTokens: options?.maxTokens,
              temperature: options?.temperature,
              stream: true,
              messages: messages.map((message) => ({
                role: message.role,
                characters:
                  typeof message.content === "string" ? message.content.length : undefined,
              })),
              tools: context.tools?.map((tool) => tool.name),
              customHeaderNames: Object.keys(connection.customHeaders),
            });
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
                messages,
                stream: true,
                max_tokens: options?.maxTokens,
                temperature: options?.temperature,
                ...(context.tools?.length
                  ? {
                      tools: context.tools.map((tool) => ({
                        type: "function",
                        function: {
                          name: tool.name,
                          description: tool.description,
                          parameters: tool.parameters,
                        },
                      })),
                      tool_choice: "auto",
                    }
                  : {}),
                include_reasoning: true,
                ...(options?.reasoning
                  ? {
                      reasoning_effort: options.reasoning,
                      custom_include_body: JSON.stringify({ reasoning_effort: options.reasoning }),
                    }
                  : {}),
              }),
            });
            stage = "response";
            responseStatus = response.status;
            record("response", {
              status: response.status,
              contentType: response.headers.get("content-type"),
            });
            if (!response.ok) {
              responseBody = await response.text();
              throw new Error(
                `模型请求失败（HTTP ${response.status} ${response.statusText}）：${responseBody}`,
                {
                  cause: {
                    status: response.status,
                    statusText: response.statusText,
                    body: responseBody,
                    headers: Object.fromEntries(response.headers),
                  },
                },
              );
            }
            stage = "stream";
            await readOpenAiStream(
              response,
              signal,
              output,
              (event) => {
                if (event.type === "text_delta") {
                  textCharacters += event.delta.length;
                }
                stream.push(event);
              },
              (event) => {
                streamEvent = event;
              },
            );
            record("complete", { stopReason: output.stopReason, textCharacters, streamEvent });
            stream.push({
              type: "done",
              reason: output.stopReason as "stop" | "length" | "toolUse",
              message: output,
            });
          } catch (error) {
            output.stopReason = signal.aborted ? "aborted" : "error";
            const originalMessage = formatThrownValue(error);
            output.errorMessage = signal.aborted
              ? signal.reason instanceof DOMException && signal.reason.name === "TimeoutError"
                ? `模型请求超时：${originalMessage}`
                : `模型请求已取消：${originalMessage}`
              : originalMessage;
            (output.diagnostics ??= []).push(
              createAssistantMessageDiagnostic("st_request_error", error, {
                requestId,
                stage,
                status: responseStatus,
                responseBody,
                originalError: error,
                abortReason: signal.reason,
                streamEvent,
              }),
            );
            record(output.stopReason, {
              stage,
              message: output.errorMessage,
              textCharacters,
              streamEvent,
              status: responseStatus,
              responseBody,
              originalError: error,
              diagnostics: output.diagnostics,
            });
            output.errorMessage += `（请求 ${requestId}，详情见控制台 STE Phone AI 日志）`;
            stream.push({ type: "error", reason: output.stopReason, error: output });
          }
        })();
        return stream;
      };
    },
  };
}
