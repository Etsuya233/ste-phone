import { Agent, type AgentEvent } from "@earendil-works/pi-agent-core";
import { createCompletionModel, runAgent } from "../../core/ai/agent-run.ts";
import type { AiTransport } from "../../core/ai/public.ts";
import type { ModelConnectionSnapshot } from "../settings/public.ts";
import type { BrowserAuthor } from "./browser-authors.ts";
import { websiteWorkspace } from "./browser-files.ts";
import type { WebsiteWork } from "./browser.ts";

const systemPrompt = `你是网页作者。参考人物资料，以该人物的视角回应用户的创作要求。
用 read_file 查看当前源码（含用户手动修改），用 write_file 或 edit_file 修改作品。为新作品命名时可在 write_file 提供 title。
作品在手机屏幕内打开，适应窄屏。使用原生浏览器能力，分别编辑 HTML、CSS 和普通 JavaScript。
预览会自动注入 style.css，script.js 作为普通脚本在正文后运行。HTML 中无需引用这三个工作区文件的相对地址，作品无需 npm 构建。
做完后用自然语言简述结果，别贴源码、输出协议块或 Memory 附录。若用户只是咨询，可以直接回答。`;

export type BrowserStep =
  | { kind: "text"; id: string; text: string }
  | { kind: "thinking"; id: string; text: string; running: boolean }
  | {
      kind: "tool";
      id: string;
      label: string;
      status: "running" | "completed" | "failed";
      input: unknown;
      output?: string;
    };

export async function generateWebsite(input: {
  transport: AiTransport;
  connection: ModelConnectionSnapshot;
  work: WebsiteWork;
  author: BrowserAuthor;
  instruction: string;
  signal: AbortSignal;
  onStep: (step: BrowserStep) => void;
}): Promise<Pick<WebsiteWork, "title" | "source" | "turns">> {
  const { transport, connection, work, author, instruction, signal, onStep } = input;
  const workspace = websiteWorkspace(work, signal);
  const stream = transport.createStream(connection, { app: "browser", operation: "网页创作" });
  let truncated = false;
  const agent = new Agent({
    toolExecution: "sequential",
    initialState: {
      model: createCompletionModel(connection.model),
      systemPrompt,
      tools: workspace.tools,
    },
    streamFn(model, context, options) {
      // Pi can retry after a truncated tool call; never issue that retry upstream.
      if (truncated) {
        throw new Error("网页创作达到输出上限，请缩小本次修改范围");
      }
      signal.throwIfAborted();
      return stream(model, context, { signal: options?.signal, maxTokens: 32768 });
    },
  });
  const prompt = JSON.stringify({
    author: { name: author.name, profileText: author.profileText },
    title: work.title,
    files: ["index.html", "style.css", "script.js"],
    turns: work.turns,
    instruction,
  });
  const record = websiteSteps(signal, onStep);
  const { reply } = await runAgent(agent, prompt, {
    signal,
    onEvent(event) {
      if (
        event.type === "message_end" &&
        event.message.role === "assistant" &&
        event.message.stopReason === "length"
      ) {
        truncated = true;
      }
      record(event);
    },
  });
  signal.throwIfAborted();
  if (truncated) {
    throw new Error("网页创作达到输出上限，请缩小本次修改范围");
  }
  if (reply?.role !== "assistant") {
    throw new Error("网页创作未收到模型回复");
  }
  if (reply.stopReason !== "stop" || reply.content.some((block) => block.type === "toolCall")) {
    throw new Error(reply.errorMessage || "网页创作未正常完成", { cause: reply.diagnostics });
  }
  const message = reply.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
  if (!message) {
    throw new Error("网页创作未收到最终回复");
  }
  return { ...workspace.result(), turns: [...work.turns, { instruction, reply: message }] };
}

function websiteSteps(signal: AbortSignal, onStep: (step: BrowserStep) => void) {
  let round = 0;
  let lastThinkingAt = -Infinity;
  const tools = new Map<string, Extract<BrowserStep, { kind: "tool" }>>();
  return (event: AgentEvent) => {
    if (signal.aborted) {
      return;
    }
    if (event.type === "tool_execution_start") {
      const step = {
        kind: "tool",
        id: `tool-${event.toolCallId}`,
        label: event.toolName,
        input: event.args,
        status: "running",
      } as const;
      tools.set(event.toolCallId, step);
      onStep(step);
    }
    if (event.type === "tool_execution_end") {
      const step = tools.get(event.toolCallId)!;
      const output = event.result.content
        .flatMap((block: { type: string; text?: string }) =>
          block.type === "text" ? [block.text] : [],
        )
        .join("\n");
      onStep({ ...step, status: event.isError ? "failed" : "completed", output });
    }
    if (!("message" in event) || event.message.role !== "assistant") {
      return;
    }
    if (event.type === "message_start") {
      round++;
      lastThinkingAt = -Infinity;
    }
    const now = performance.now();
    const finished = event.type === "message_end";
    if (
      !finished &&
      !(
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "thinking_delta" &&
        now - lastThinkingAt >= 80
      )
    ) {
      return;
    }
    const text = event.message.content
      .flatMap((block) => (block.type === "thinking" ? [block.thinking] : []))
      .join("\n");
    if (text) {
      lastThinkingAt = now;
      onStep({ kind: "thinking", id: `thinking-${round}`, text, running: !finished });
    }
    if (finished && event.message.content.some((block) => block.type === "toolCall")) {
      const narration = event.message.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("")
        .trim();
      if (narration) {
        onStep({ kind: "text", id: `text-${round}`, text: narration });
      }
    }
  };
}
