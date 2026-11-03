import assert from "node:assert/strict";
import test from "node:test";
import type { AssistantMessage, Model } from "@earendil-works/pi-ai";
import { createPhoneLog } from "../../apps/logs/public.ts";
import { createStAiTransport } from "./ai-transport.ts";

const model: Model<"openai-completions"> = {
  id: "logging-model",
  name: "Logging",
  api: "openai-completions",
  provider: "application",
  baseUrl: "unused",
  reasoning: false,
  input: ["text"],
  contextWindow: 0,
  maxTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const connection = {
  baseUrl: "https://example.com/v1",
  apiKey: "fixture-api-key",
  customHeaders: { "X-Private": "fixture-header-value" },
};

test("one terminal log retains the sent input and complete structured output across persistence", async () => {
  let stored = "";
  const storage = {
    read: () => stored,
    write: (value: string) => {
      stored = value;
    },
    clear: () => {
      stored = "";
    },
  };
  const logs = createPhoneLog({ storage });
  let sent: Record<string, unknown> | undefined;
  const stream = createStAiTransport(() => ({}), {
    log: (entry) => logs.info("wechat", "STE Phone AI", String(entry.event), entry),
    fetchImpl: async (_, options) => {
      sent = JSON.parse(options!.body as string);
      return new Response(
        'data: {"choices":[{"delta":{"reasoning_content":"检查资料","content":"完整回复","tool_calls":[{"index":0,"id":"call-1","function":{"name":"lookup","arguments":"{\\"name\\":\\"人物\\"}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n',
      );
    },
  }).createStream(connection, { operation: "微信回复", app: "wechat" });
  const result = await (
    await stream(
      model,
      {
        systemPrompt: "完整系统规则",
        messages: [{ role: "user", content: "完整用户输入", timestamp: 0 }],
        tools: [
          {
            name: "lookup",
            description: "查询人物",
            parameters: { type: "object", properties: {} },
          },
        ],
      },
      { maxTokens: 123, temperature: 0.3, reasoning: "low" },
    )
  ).result();

  assert.equal(result.stopReason, "toolUse");
  const restored = createPhoneLog({ storage }).getSnapshot();
  const terminal = JSON.parse(restored.at(-1)!.details!);
  const { custom_include_headers, ...expectedInput } = sent!;
  assert.ok(custom_include_headers);
  assert.deepEqual(terminal.input, expectedInput);
  assert.deepEqual(terminal.output, result);
  assert.equal(terminal.requestId, JSON.parse(restored[0]!.details!).requestId);
  assert.deepEqual(
    terminal.output.content.map((part: { type: string }) => part.type),
    ["thinking", "text", "toolCall"],
  );
  for (const credential of [connection.apiKey, connection.customHeaders["X-Private"]]) {
    assert.ok(!stored.includes(credential));
  }
});

test("terminal logs preserve partial output on truncation, stream failure and cancellation", async () => {
  for (const ending of ["length", "error", "aborted"] as const) {
    const entries: Readonly<Record<string, unknown>>[] = [];
    const controller = new AbortController();
    const stream = createStAiTransport(() => ({}), {
      log: (entry) => entries.push(entry),
      fetchImpl: async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(source) {
              source.enqueue(
                new TextEncoder().encode(
                  'data: {"choices":[{"delta":{"content":"已收到正文","reasoning_content":"已有思考"},"finish_reason":null}]}\n\n',
                ),
              );
              if (ending === "length") {
                source.enqueue(
                  new TextEncoder().encode(
                    'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',
                  ),
                );
                source.close();
              } else if (ending === "error") {
                source.close();
              }
            },
          }),
        ),
    }).createStream(connection);
    const response = await stream(
      model,
      {
        messages: [{ role: "user", content: "本轮输入", timestamp: 0 }],
      },
      { signal: controller.signal },
    );
    for await (const event of response) {
      if (ending === "aborted" && event.type === "thinking_delta") {
        controller.abort();
      }
    }
    const result = await response.result();
    const terminal = entries.at(-1)!;
    assert.equal(result.stopReason, ending);
    assert.equal(terminal.event, ending === "length" ? "complete" : ending);
    assert.deepEqual(terminal.output, result);
    assert.equal(
      (terminal.input as { messages: { content: string }[] }).messages[0]!.content,
      "本轮输入",
    );
    assert.deepEqual(result.content, [
      { type: "thinking", thinking: "已有思考" },
      { type: "text", text: "已收到正文" },
    ]);
    // 日志持有结束时的快照，调用方后续修改返回消息不能改写历史。
    const savedOutput = structuredClone(terminal.output);
    (result as AssistantMessage).content.length = 0;
    assert.deepEqual(terminal.output, savedOutput);
  }
});
