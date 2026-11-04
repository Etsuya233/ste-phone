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
  onThinking(): void;
  imagePromptOnly?: boolean;
}): Promise<string> {
  const stream = input.transport.createStream(input.connection, {
    operation: input.imagePromptOnly ? "日记配图描述" : "日记生成",
    app: "diary",
  });
  const agent = new Agent({
    initialState: {
      model: createCompletionModel(input.connection.model),
      tools: [],
      systemPrompt: input.imagePromptOnly
        ? '根据已保存的日记正文与作者，提炼一幅配图的画面描述。只输出JSON对象 {"imagePrompt":"非空画面描述"}，不改写日记，不添加重大事实。人物使用正文与作者中的明确姓名，避免仅写“我”“他”“她”，以便匹配参考图；不臆造外貌。'
        : diarySystemPrompt,
    },
    streamFn: (model, context, options) =>
      stream(model, context, { signal: options?.signal, maxTokens: input.settings.maxTokens }),
  });
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
      if (event.type === "message_update" && event.message.role === "assistant") {
        if (event.assistantMessageEvent.type === "thinking_delta") {
          input.onThinking();
        }
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

export function parseDiaryReply(text: string): { body: string; imagePrompt: string } {
  const value = JSON.parse(text) as Record<string, unknown>;
  if (typeof value.body !== "string" || !value.body.trim()) {
    throw new Error("日记回复缺少有效正文 body");
  }
  return { body: value.body.trim(), imagePrompt: parseImagePrompt(value) };
}

export function parseImagePrompt(value: Record<string, unknown>): string {
  if (typeof value.imagePrompt !== "string" || !value.imagePrompt.trim()) {
    throw new Error("日记回复缺少有效配图描述 imagePrompt");
  }
  return value.imagePrompt.trim();
}
