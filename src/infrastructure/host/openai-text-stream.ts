export interface TextCompletion {
  text: string;
  truncated: boolean;
}

interface CompletionChunk {
  error?: { message?: string } | string | boolean;
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: unknown;
      function_call?: unknown;
      reasoning_content?: unknown;
      thinking?: unknown;
    };
    finish_reason?: string | null;
  }[];
}

/** Consume the single textual choice and require the OpenAI completion sentinel. */
export async function readOpenAiTextStream(
  response: Response,
  signal: AbortSignal,
  onText: (text: string) => void,
): Promise<TextCompletion> {
  if (!response.body) throw new Error("模型响应没有可读流");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let data: string[] = [];
  let text = "";
  let finishReason: "stop" | "length" | undefined;
  let completed = false;
  let jsonResponse: boolean | undefined;

  function decodeChunk(payload: string): CompletionChunk {
    let chunk: CompletionChunk;
    try {
      chunk = JSON.parse(payload) as CompletionChunk;
    } catch {
      throw new Error("响应流包含无效 JSON");
    }
    if (chunk === null || typeof chunk !== "object") throw new Error("模型响应格式错误");
    if (chunk.error) {
      const detail =
        typeof chunk.error === "string"
          ? chunk.error
          : typeof chunk.error === "object"
            ? chunk.error.message
            : undefined;
      throw new Error(detail ? `模型服务错误：${detail}` : "模型服务返回错误");
    }
    return chunk;
  }

  function receiveEvent() {
    if (data.length === 0) return;
    const payload = data.join("\n");
    data = [];
    if (payload === "") return;
    if (payload === "[DONE]") {
      if (!finishReason) throw new Error("模型响应缺少结束原因");
      if (text.trim() === "") throw new Error("模型返回了空回复");
      completed = true;
      return;
    }
    const chunk = decodeChunk(payload);
    if (!Array.isArray(chunk.choices)) throw new Error("模型响应缺少 choices");
    // A usage-only SSE chunk may follow the final choice.
    if (chunk.choices.length === 0) return;
    if (chunk.choices.length !== 1) throw new Error("连接测试仅支持单条文本回复");
    const choice = chunk.choices[0]!;
    const delta = choice.delta;
    if (
      delta?.tool_calls != null ||
      delta?.function_call != null ||
      delta?.reasoning_content != null ||
      delta?.thinking != null
    )
      throw new Error("连接测试仅支持文本回复，暂不支持工具或思考内容");
    if (delta?.content != null) {
      if (typeof delta.content !== "string") throw new Error("模型返回了非文本内容");
      if (finishReason) throw new Error("模型结束后继续返回内容");
      text += delta.content;
      onText(text);
    }
    if (choice.finish_reason != null) {
      if (choice.finish_reason !== "stop" && choice.finish_reason !== "length")
        throw new Error("模型返回了不支持的结束原因");
      if (finishReason) throw new Error("模型重复返回结束原因");
      finishReason = choice.finish_reason;
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
    void reader.cancel().catch(() => {});
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
          throw new Error("模型服务没有返回 SSE 文本流");
        }
        receiveLines(true);
        if (!completed) throw new Error("模型响应流意外中断（缺少 [DONE]）");
      } else {
        buffer += decoder.decode(part.value, { stream: true });
        // ST's streaming proxy does not forward the upstream Content-Type header.
        // Distinguish an HTTP-200 JSON error body from SSE using the actual body.
        const first = buffer.trimStart()[0];
        if (jsonResponse === undefined && first !== undefined)
          jsonResponse = first === "{" || first === "[";
        if (jsonResponse === false) receiveLines(false);
      }
    }
    return { text, truncated: finishReason === "length" };
  } finally {
    signal.removeEventListener("abort", cancelRead);
    // Completion is defined by [DONE], so a still-open HTTP body must not delay it.
    await reader.cancel();
    reader.releaseLock();
  }
}
