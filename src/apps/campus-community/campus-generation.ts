import { Agent } from "@earendil-works/pi-agent-core";
import { createCompletionModel, runAgent } from "../../core/ai/agent-run.ts";
import type { AiTransport } from "../../core/ai/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type { ModelConnectionSnapshot, ModelConnectionsReader } from "../settings/public.ts";
import type { CampusBatch, CampusGenerationRequest } from "./campus-domain.ts";
import { parseCampusBatch } from "./campus-output.ts";
import { campusSystemPrompt, readCampusPrompt } from "./campus-prompt.ts";

export async function generateCampusBatch(
  deps: { data: DataAppPublic; connections: ModelConnectionsReader; transport: AiTransport },
  request: CampusGenerationRequest,
  signal: AbortSignal,
): Promise<CampusBatch> {
  signal.throwIfAborted();
  const id = deps.connections.getSnapshot().defaultModelConnectionId;
  if (!id) {
    throw new Error("请在设置中选择默认模型连接");
  }
  const connection = deps.connections.getConnection(id);
  const context = await readCampusPrompt(deps.data, request);
  signal.throwIfAborted();
  const output = await requestCampusOutput({
    transport: deps.transport,
    connection,
    operation: request.postId ? "校园社区互动" : "校园社区发帖",
    prompt: JSON.stringify(context),
    systemPrompt: campusSystemPrompt(request, context.targetPost),
    signal,
  });
  return parseCampusBatch(
    output,
    request.id,
    context.accounts.map(({ id }) => id),
    context.targetPost,
    context.automatic,
  );
}

async function requestCampusOutput(input: {
  transport: AiTransport;
  connection: ModelConnectionSnapshot;
  operation: string;
  prompt: string;
  systemPrompt: string;
  signal: AbortSignal;
}): Promise<string> {
  const stream = input.transport.createStream(input.connection, {
    app: "campus-community",
    operation: input.operation,
  });
  const agent = new Agent({
    initialState: {
      model: createCompletionModel(input.connection.model),
      systemPrompt: input.systemPrompt,
      tools: [],
    },
    streamFn: (model, context, options) =>
      stream(model, context, { signal: options?.signal, maxTokens: 10240 }),
  });
  let unexpectedTool = false;
  const { reply, timedOut } = await runAgent(agent, input.prompt, {
    signal: input.signal,
    timeoutMs: 300000,
    onEvent(event) {
      if (
        event.type === "message_end" &&
        event.message.role === "assistant" &&
        event.message.content.some((part) => part.type === "toolCall")
      ) {
        unexpectedTool = true;
        agent.abort();
      }
    },
  });
  input.signal.throwIfAborted();
  if (unexpectedTool) {
    throw new Error("校园社区模型返回了未注册的工具调用");
  }
  if (timedOut) {
    throw new Error("校园社区生成超时");
  }
  if (reply?.role !== "assistant") {
    throw new Error("模型未返回校园社区内容");
  }
  if (reply.stopReason !== "stop") {
    const message =
      reply.stopReason === "length"
        ? "校园社区生成达到输出上限，整批未保存"
        : reply.errorMessage || "校园社区模型请求未完成";
    throw new Error(message, { cause: reply.diagnostics });
  }
  return reply.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
}
