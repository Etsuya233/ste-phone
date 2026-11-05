import { Agent } from "@earendil-works/pi-agent-core";
import type { AiTransport } from "../../core/ai/public.ts";
import { createCompletionModel, runAgent } from "../../core/ai/agent-run.ts";
import type { ModelConnectionSnapshot } from "../settings/public.ts";
import { mapSystemPrompt } from "./map-protocol.ts";

export async function generateMapText(input: {
  transport: AiTransport;
  connection: ModelConnectionSnapshot;
  prompt: string;
  signal: AbortSignal;
}): Promise<string> {
  const stream = input.transport.createStream(input.connection, {
    operation: "地图提案",
    app: "map",
  });
  const agent = new Agent({
    initialState: {
      model: createCompletionModel(input.connection.model),
      tools: [],
      systemPrompt: mapSystemPrompt,
    },
    streamFn: (model, context, options) =>
      stream(model, context, { signal: options?.signal, maxTokens: 24576 }),
  });
  const { reply, timedOut } = await runAgent(agent, input.prompt, {
    signal: input.signal,
    timeoutMs: 300000,
    onEvent() {},
  });
  input.signal.throwIfAborted();
  if (timedOut) {
    throw new Error("地图生成超时，请重试");
  }
  if (reply?.role !== "assistant") {
    throw new Error("地图生成未收到模型回复");
  }
  if (reply.stopReason === "length") {
    throw new Error("地图回复被截断，未应用任何修改");
  }
  if (reply.stopReason !== "stop") {
    throw new Error(reply.errorMessage || "地图生成未正常完成");
  }
  if (reply.content.some((block) => block.type === "toolCall")) {
    throw new Error("地图不支持模型工具调用");
  }
  const text = reply.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!text) {
    throw new Error("模型返回空地图回复");
  }
  return text;
}
