import {
  createAssistantMessageDiagnostic,
  type AssistantMessage,
  type AssistantMessageEvent,
  type TextContent,
  type ThinkingContent,
  type ToolCall,
} from "@earendil-works/pi-ai";

export interface StreamEventSummary {
  readonly eventIndex: number;
  readonly payloadCharacters: number;
  readonly fields?: readonly string[];
  readonly choiceCount?: number;
  readonly finishReason?: string | null;
  readonly delta?: Readonly<Record<string, { type: string; length?: number }>>;
}
interface ToolDelta {
  index: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}
interface CompletionChunk {
  id?: string;
  model?: string;
  error?: unknown;
  choices?: {
    delta?: {
      content?: string | null;
      reasoning_content?: string | null;
      thinking?: string | null;
      tool_calls?: ToolDelta[];
      function_call?: { name?: string; arguments?: string };
    };
    finish_reason?: string | null;
  }[];
}

/** Translate one OpenAI choice into Pi blocks; acceptance of its contents belongs to the caller. */
export async function readOpenAiStream(
  response: Response,
  signal: AbortSignal,
  output: AssistantMessage,
  push: (event: AssistantMessageEvent) => void,
  onEvent?: (event: StreamEventSummary) => void,
): Promise<void> {
  if (!response.body) throw new Error("模型响应没有可读流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let data: string[] = [];
  let finishReason: string | undefined;
  let completed = false;
  let jsonResponse: boolean | undefined;
  let eventIndex = 0;
  let text: TextContent | undefined;
  let thinking: ThinkingContent | undefined;
  const calls = new Map<number, { block: ToolCall; argumentsText: string }>();
  let failed = false;
  let cleanupFailure: { error: unknown } | undefined;

  function decodeChunk(payload: string): CompletionChunk {
    let chunk: CompletionChunk;
    try {
      chunk = JSON.parse(payload) as CompletionChunk;
    } catch (cause) {
      throw new Error(`响应流包含无效 JSON：${payload}`, { cause });
    }
    if (chunk === null || typeof chunk !== "object")
      throw new Error(`模型响应格式错误：${payload}`, { cause: chunk });
    onEvent?.({ eventIndex, payloadCharacters: payload.length, fields: Object.keys(chunk) });
    if (chunk.error != null) throw new Error(`模型服务错误：${payload}`, { cause: chunk.error });
    return chunk;
  }

  function appendCall(delta: ToolDelta) {
    if (!Number.isInteger(delta.index) || delta.index < 0)
      throw new Error(`工具调用 index 无效：${JSON.stringify(delta)}`, { cause: delta });
    let call = calls.get(delta.index);
    if (!call) {
      call = { block: { type: "toolCall", id: "", name: "", arguments: {} }, argumentsText: "" };
      calls.set(delta.index, call);
      output.content.push(call.block);
      push({
        type: "toolcall_start",
        contentIndex: output.content.indexOf(call.block),
        partial: output,
      });
    }
    if (delta.id !== undefined) call.block.id += delta.id;
    if (delta.function?.name !== undefined) call.block.name += delta.function.name;
    if (delta.function?.arguments !== undefined) {
      call.argumentsText += delta.function.arguments;
      push({
        type: "toolcall_delta",
        contentIndex: output.content.indexOf(call.block),
        delta: delta.function.arguments,
        partial: output,
      });
    }
  }

  function receiveEvent() {
    if (data.length === 0) return;
    const payload = data.join("\n");
    data = [];
    if (payload === "") return;
    eventIndex++;
    onEvent?.({ eventIndex, payloadCharacters: payload.length });
    if (payload === "[DONE]") {
      if (!finishReason) throw new Error("模型响应缺少结束原因");
      completed = true;
      return;
    }
    const chunk = decodeChunk(payload);
    if (chunk.id !== undefined) output.responseId = chunk.id;
    if (chunk.model !== undefined) output.responseModel = chunk.model;
    if (!Array.isArray(chunk.choices))
      throw new Error(`模型响应缺少 choices：${payload}`, { cause: chunk });
    if (chunk.choices.length === 0) return;
    if (chunk.choices.length !== 1)
      throw new Error(`模型传输需要单个 choice，实际收到 ${chunk.choices.length} 个`, {
        cause: chunk,
      });
    const choice = chunk.choices[0]!;
    const delta = choice.delta;
    onEvent?.({
      eventIndex,
      payloadCharacters: payload.length,
      fields: Object.keys(chunk),
      choiceCount: chunk.choices.length,
      finishReason: choice.finish_reason,
      delta: Object.fromEntries(
        Object.entries(delta ?? {}).map(([name, value]) => [
          name,
          {
            type: value === null ? "null" : Array.isArray(value) ? "array" : typeof value,
            ...(typeof value === "string" || Array.isArray(value) ? { length: value.length } : {}),
          },
        ]),
      ),
    });
    if (
      finishReason &&
      delta &&
      Object.values(delta).some((value) => value != null && value !== "")
    )
      throw new Error(`模型结束后继续返回内容：${payload}`, { cause: chunk });
    const thought = delta?.reasoning_content ?? delta?.thinking;
    if (thought != null && thought !== "") {
      if (typeof thought !== "string")
        throw new Error(`模型返回了非文本思考：${payload}`, { cause: chunk });
      if (!thinking) {
        thinking = { type: "thinking", thinking: "" };
        output.content.push(thinking);
        push({
          type: "thinking_start",
          contentIndex: output.content.indexOf(thinking),
          partial: output,
        });
      }
      thinking.thinking += thought;
      push({
        type: "thinking_delta",
        contentIndex: output.content.indexOf(thinking),
        delta: thought,
        partial: output,
      });
    }
    if (delta?.content != null && delta.content !== "") {
      if (typeof delta.content !== "string")
        throw new Error(`模型返回了非文本内容：${payload}`, { cause: chunk });
      if (!text) {
        text = { type: "text", text: "" };
        output.content.push(text);
        push({ type: "text_start", contentIndex: output.content.indexOf(text), partial: output });
      }
      text.text += delta.content;
      push({
        type: "text_delta",
        contentIndex: output.content.indexOf(text),
        delta: delta.content,
        partial: output,
      });
    }
    if (delta?.tool_calls != null) {
      if (!Array.isArray(delta.tool_calls))
        throw new Error(`tool_calls 必须为数组：${payload}`, { cause: chunk });
      for (const call of delta.tool_calls) appendCall(call);
    }
    if (delta?.function_call != null)
      appendCall({
        index: 0,
        ...(calls.has(0) ? {} : { id: "legacy-call-0" }),
        function: delta.function_call,
      });
    if (choice.finish_reason != null) {
      if (finishReason) throw new Error(`模型重复返回结束原因：${payload}`, { cause: chunk });
      finishReason = choice.finish_reason;
      output.rawStopReason = finishReason;
      if (finishReason === "stop" || finishReason === "length") output.stopReason = finishReason;
      else if (finishReason === "tool_calls" || finishReason === "function_call")
        output.stopReason = "toolUse";
      else throw new Error(`模型返回结束原因 ${finishReason}：${payload}`, { cause: chunk });
    }
  }

  function receiveLines(end: boolean) {
    while (!completed) {
      const ending = buffer.search(/[\r\n]/);
      if (ending === -1) break;
      if (!end && buffer[ending] === "\r" && ending === buffer.length - 1) break;
      const line = buffer.slice(0, ending);
      const width = buffer[ending] === "\r" && buffer[ending + 1] === "\n" ? 2 : 1;
      buffer = buffer.slice(ending + width);
      if (line === "") receiveEvent();
      else if (line.startsWith("data:")) data.push(line.slice(line[5] === " " ? 6 : 5));
    }
  }
  const cancelRead = () => {
    void reader.cancel().catch((error) => {
      (output.diagnostics ??= []).push(
        createAssistantMessageDiagnostic("stream_cancel_error", error, { originalError: error }),
      );
    });
  };
  signal.addEventListener("abort", cancelRead, { once: true });
  try {
    signal.throwIfAborted();
    while (!completed) {
      const part = await reader.read();
      signal.throwIfAborted();
      if (part.done) {
        buffer += decoder.decode();
        if (jsonResponse) {
          decodeChunk(buffer);
          throw new Error(`模型服务没有返回 SSE 流：${buffer}`);
        }
        receiveLines(true);
        if (!completed) throw new Error("模型响应流意外中断（缺少 [DONE]）");
      } else {
        buffer += decoder.decode(part.value, { stream: true });
        const first = buffer.trimStart()[0];
        if (jsonResponse === undefined && first !== undefined)
          jsonResponse = first === "{" || first === "[";
        if (jsonResponse === false) receiveLines(false);
      }
    }
    if (output.stopReason === "toolUse" && calls.size === 0)
      throw new Error(`模型以 ${finishReason} 结束，但未返回工具调用`);
    for (const { block, argumentsText } of calls.values()) {
      if (!block.id || !block.name)
        throw new Error(`工具调用缺少 id 或名称：${JSON.stringify(block)}`, { cause: block });
      if (output.stopReason !== "length") {
        try {
          block.arguments = JSON.parse(argumentsText) as Record<string, unknown>;
        } catch (cause) {
          throw new Error(`工具 ${block.name} 的参数不是有效 JSON：${argumentsText}`, { cause });
        }
        if (
          block.arguments === null ||
          typeof block.arguments !== "object" ||
          Array.isArray(block.arguments)
        )
          throw new Error(`工具 ${block.name} 的参数必须是对象：${argumentsText}`, {
            cause: block.arguments,
          });
      }
    }
    for (const block of output.content) {
      const contentIndex = output.content.indexOf(block);
      if (block.type === "text")
        push({ type: "text_end", contentIndex, content: block.text, partial: output });
      else if (block.type === "thinking")
        push({ type: "thinking_end", contentIndex, content: block.thinking, partial: output });
      else push({ type: "toolcall_end", contentIndex, toolCall: block, partial: output });
    }
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    signal.removeEventListener("abort", cancelRead);
    try {
      await reader.cancel();
    } catch (error) {
      if (!failed) cleanupFailure = { error };
      (output.diagnostics ??= []).push(
        createAssistantMessageDiagnostic("stream_cleanup_error", error, { originalError: error }),
      );
    } finally {
      reader.releaseLock();
    }
  }
  if (cleanupFailure) throw cleanupFailure.error;
}
