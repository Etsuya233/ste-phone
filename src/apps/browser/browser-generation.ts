import { Agent } from "@earendil-works/pi-agent-core";
import { createCompletionModel, runAgent } from "../../core/ai/agent-run.ts";
import type { AiTransport } from "../../core/ai/public.ts";
import type { ModelConnectionSnapshot } from "../settings/public.ts";
import type { BrowserAuthor } from "./browser-authors.ts";
import type { WebsiteWork } from "./browser.ts";

const systemPrompt = `你是网页作者。参考人物资料，以该人物的视角回应用户的创作要求。
返回单个 JSON 对象，字段为 title、reply、html、css、js，五个字段均为字符串。回答以该 JSON 对象开始并结束，不输出代码围栏、额外说明或 Memory 附录。
reply 用于创作对话，说明这轮做了什么。html、css、js 分别为三个文件的完整内容，即使某个文件未改也要原样返回。
当前源码是唯一有效版本，包含用户的手动修改。历史创作对话仅用于理解上下文。
网页会在手机屏幕内打开，适应窄屏。使用原生浏览器能力，将 CSS 和普通 JavaScript 放进各自字段，不引用本地文件或 npm 包。`;

export async function generateWebsite(input: {
  transport: AiTransport;
  connection: ModelConnectionSnapshot;
  work: WebsiteWork;
  author: BrowserAuthor;
  instruction: string;
  signal: AbortSignal;
  onThinking: (text: string) => void;
}): Promise<Pick<WebsiteWork, "title" | "source" | "turns">> {
  const { transport, connection, work, author, instruction, signal } = input;
  const stream = transport.createStream(
    connection,
    { app: "browser", operation: "网页创作" },
    { outputFormat: "json-object" },
  );
  const agent = new Agent({
    initialState: { model: createCompletionModel(connection.model), systemPrompt, tools: [] },
    streamFn: (model, context, options) =>
      stream(model, context, { signal: options?.signal, maxTokens: 32768 }),
  });
  const prompt = JSON.stringify({
    author: { name: author.name, profileText: author.profileText },
    title: work.title,
    source: work.source,
    turns: work.turns,
    instruction,
  });
  let lastThinkingAt = -Infinity;
  const { reply, timedOut } = await runAgent(agent, prompt, {
    signal,
    timeoutMs: 300_000,
    onEvent(event) {
      if (signal.aborted || event.type !== "message_update" || event.message.role !== "assistant") {
        return;
      }
      const update = event.assistantMessageEvent;
      const now = performance.now();
      if (
        update.type === "thinking_end" ||
        (update.type === "thinking_delta" && now - lastThinkingAt >= 80)
      ) {
        lastThinkingAt = now;
        input.onThinking(
          event.message.content
            .flatMap((block) => (block.type === "thinking" ? [block.thinking] : []))
            .join("\n"),
        );
      }
    },
  });
  signal.throwIfAborted();
  // A transport may deliver its complete reasoning only in the terminal message.
  if (reply?.role === "assistant") {
    input.onThinking(
      reply.content
        .flatMap((block) => (block.type === "thinking" ? [block.thinking] : []))
        .join("\n"),
    );
  }
  if (timedOut) {
    throw new Error("网页创作超时");
  }
  if (reply?.role !== "assistant") {
    throw new Error("网页创作未收到模型回复");
  }
  if (reply.stopReason === "length") {
    throw new Error("网页创作达到输出上限，请缩小本次修改范围");
  }
  if (reply.stopReason !== "stop" || reply.content.some((block) => block.type === "toolCall")) {
    throw new Error(reply.errorMessage || "网页创作未正常完成", { cause: reply.diagnostics });
  }
  const text = reply.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
  const { title, message, source } = websiteReply(text);
  return {
    title,
    source,
    turns: [...work.turns, { instruction, reply: message }],
  };
}

function websiteReply(text: string): {
  title: string;
  message: string;
  source: WebsiteWork["source"];
} {
  let output: unknown;
  try {
    output = JSON.parse(text);
  } catch {
    throw new Error("模型未返回有效的网页 JSON");
  }
  if (!output || typeof output !== "object") {
    throw new Error("模型返回的网页格式无效");
  }
  const { title, reply: message, html, css, js } = output as Record<string, unknown>;
  if (
    typeof title !== "string" ||
    !title.trim() ||
    typeof message !== "string" ||
    !message.trim() ||
    typeof html !== "string" ||
    typeof css !== "string" ||
    typeof js !== "string"
  ) {
    throw new Error("模型需返回标题、回复和完整的 HTML、CSS、JavaScript");
  }
  return { title: title.trim(), message: message.trim(), source: { html, css, js } };
}
