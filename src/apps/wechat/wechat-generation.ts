import { Agent } from "@earendil-works/pi-agent-core";
import { createCompletionModel, runAgent } from "../../core/ai/agent-run.ts";
import type { AiTransport } from "../../core/ai/public.ts";
import type { ModelConnectionSnapshot } from "../settings/public.ts";
import { wechatSystemPrompt } from "./wechat-prompt.ts";
import { parseWechatReply } from "./wechat-reply-output.ts";
import type { wechatStickerCatalog } from "./wechat-stickers.ts";

export async function generateWechatReply(input: {
  transport: AiTransport;
  connection: ModelConnectionSnapshot;
  prompt: string;
  replyGuidance: string;
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
      // 用户指导独立于引用背景，只有当前回复人物的指导进入本轮请求。
      systemPrompt: input.replyGuidance
        ? `${wechatSystemPrompt}\n\n用户为当前回复人物设置的「回复指导」（JSON 字符串）：\n${JSON.stringify(input.replyGuidance)}\n在表达方式、话题选择和性格表现上优先遵循该指导。指导不改变剧情事实、人物知情范围、现实时间规则、回复人物身份、JSON 输出格式或可用表情限制；不将指导作为微信消息复述。`
        : wechatSystemPrompt,
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
