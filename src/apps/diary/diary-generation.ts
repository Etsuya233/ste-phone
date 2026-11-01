import { Agent } from "@earendil-works/pi-agent-core";
import { createCompletionModel, runAgent } from "../../core/ai/agent-run.ts";
import { diarySystemPrompt } from "./diary-prompt.ts";
import type { AiTransport } from "../../core/ai/public.ts";
import type { ModelConnectionSnapshot } from "../settings/public.ts";
import type { DiarySettings } from "./diary.ts";

/** 日记只接收完整正文；工具策略和截断处理归日记应用所有。 */
export async function generateDiaryText(input: {
  transport: AiTransport;
  connection: ModelConnectionSnapshot;
  settings: DiarySettings;
  prompt: string;
  signal: AbortSignal;
  onText(text: string): void;
}): Promise<string> {
  const stream = input.transport.createStream(input.connection, { operation: "日记生成" });
  const agent = new Agent({
    initialState: {
      model: createCompletionModel(input.connection.model),
      tools: [],
      systemPrompt: diarySystemPrompt,
    },
    streamFn: (model, context, options) =>
      stream(model, context, { signal: options?.signal, maxTokens: input.settings.maxTokens }),
  });
  let text = "";
  let toolFailure: Error | undefined;
  const { reply, timedOut } = await runAgent(agent, input.prompt, {
    signal: input.signal,
    timeoutMs: input.settings.timeoutSeconds * 1000,
    onEvent(event) {
      if (event.type === "message_end" && event.message.role === "assistant") {
        const calls = event.message.content.filter((block) => block.type === "toolCall");
        if (calls.length) {
          toolFailure = new Error(
            `日记生成未注册工具，收到工具调用：${calls.map((call) => call.name).join("、")}`,
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
        text += event.assistantMessageEvent.delta;
        input.onText(text);
      }
    },
  });
  if (toolFailure) {
    throw toolFailure;
  }
  input.signal.throwIfAborted();
  if (reply?.role !== "assistant") {
    throw new Error("日记生成未收到模型回复");
  }
  if (timedOut) {
    throw new Error(`日记生成超时（${input.settings.timeoutSeconds} 秒）：${reply.errorMessage}`, {
      cause: reply.diagnostics,
    });
  }
  if (reply.stopReason === "length") {
    throw new Error("日记达到输出上限，正文未保存，请增加输出上限后重试", { cause: reply });
  }
  if (reply.stopReason !== "stop") {
    throw new Error(reply.errorMessage || "日记生成未正常完成", { cause: reply.diagnostics });
  }
  const body = reply.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!body) {
    throw new Error("模型返回了空日记", { cause: reply });
  }
  return body;
}
