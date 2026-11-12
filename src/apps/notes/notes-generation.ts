import { Agent } from "@earendil-works/pi-agent-core";
import { createCompletionModel, runAgent } from "../../core/ai/agent-run.ts";
import type { AiTransport } from "../../core/ai/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";

export async function generateNoteText(
  connections: ModelConnectionsReader,
  transport: AiTransport,
  instruction: string,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<string> {
  signal.throwIfAborted();
  const prompt = instruction.trim();
  if (!prompt) {
    throw new Error("请输入本次写作指令");
  }
  const { defaultModelConnectionId } = connections.getSnapshot();
  if (!defaultModelConnectionId) {
    throw new Error("请先前往设置选择默认模型连接");
  }
  const connection = connections.getConnection(defaultModelConnectionId);
  const stream = transport.createStream(connection, { operation: "备忘录写作", app: "notes" });
  const agent = new Agent({
    initialState: {
      model: createCompletionModel(connection.model),
      tools: [],
      systemPrompt: "按用户本次指令撰写备忘录。只返回要插入的纯文本正文，不加代码围栏或对话说明。",
    },
    streamFn: (model, context, options) =>
      stream(model, context, { signal: options?.signal, maxTokens: 4096 }),
  });

  let streamed = "";
  const { reply } = await runAgent(agent, prompt, {
    signal,
    onEvent(event) {
      if (
        !signal.aborted &&
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        streamed += event.assistantMessageEvent.delta;
        onText(streamed);
      }
    },
  });
  signal.throwIfAborted();
  if (reply?.role !== "assistant") {
    throw new Error("备忘录写作未收到模型回复");
  }
  if (reply.stopReason === "length") {
    throw new Error("备忘录写作达到输出上限，请缩短生成内容后重试");
  }
  if (reply.stopReason !== "stop" || reply.content.some((block) => block.type === "toolCall")) {
    throw new Error(reply.errorMessage || "备忘录写作未正常完成", { cause: reply.diagnostics });
  }
  const text = reply.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  if (!text.trim()) {
    throw new Error("模型返回了空白正文");
  }
  return text;
}
