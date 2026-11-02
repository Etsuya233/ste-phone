import { Agent } from "@earendil-works/pi-agent-core";
import { createCompletionModel, runAgent } from "../../core/ai/agent-run.ts";
import type { AiTransport } from "../../core/ai/public.ts";
import type { ModelConnectionSnapshot } from "../settings/public.ts";
import { wechatSystemPrompt, parseWechatReply } from "./wechat-prompt.ts";
import type { wechatStickerCatalog } from "./wechat-stickers.ts";

export async function generateWechatReply(input: {
  transport: AiTransport;
  connection: ModelConnectionSnapshot;
  prompt: string;
  signal: AbortSignal;
  stickers: ReturnType<typeof wechatStickerCatalog>;
}) {
  const stream = input.transport.createStream(input.connection, {
    operation: "微信回复",
    app: "wechat",
  });
  const agent = new Agent({
    initialState: {
      model: createCompletionModel(input.connection.model),
      tools: [],
      systemPrompt: wechatSystemPrompt,
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
        toolError = new Error("微信未注册工具，模型返回了工具调用");
        agent.abort();
      }
    },
  });
  input.signal.throwIfAborted();
  if (toolError) {
    throw toolError;
  }
  if (timedOut) {
    throw new Error("微信回复超时");
  }
  if (reply?.role !== "assistant") {
    throw new Error("模型未返回微信回复");
  }
  if (reply.stopReason !== "stop") {
    throw new Error(
      reply.stopReason === "length" ? "微信回复达到输出上限，未保存部分消息" : reply.errorMessage,
      { cause: reply.diagnostics },
    );
  }
  const text = reply.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
  return parseWechatReply(text, input.stickers);
}
