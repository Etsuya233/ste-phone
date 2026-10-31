import assert from "node:assert/strict";
import test from "node:test";
import type { Model } from "@earendil-works/pi-ai";
import { createStAiTransport } from "./ai-transport.ts";
const model: Model<"openai-completions"> = {
  id: "application-model",
  name: "Application",
  api: "openai-completions",
  provider: "application",
  baseUrl: "unused",
  reasoning: false,
  input: ["text"],
  contextWindow: 0,
  maxTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const wire =
  'data: {"choices":[{"delta":{"content":"Hi"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n';

test("request logs retain the exact malformed response and its original cause", async () => {
  const logs: Readonly<Record<string, unknown>>[] = [];
  const connection = {
    baseUrl: "https://example.com/v1",
    apiKey: "private-key",
    customHeaders: { "X-Private": "private-header" },
  };
  const stream = createStAiTransport(() => ({}), {
    log: (entry) => logs.push(entry),
    fetchImpl: async () =>
      new Response(
        'data: {"choices":[{"delta":{"tool_calls":{},"reasoning_content":"private-thought","content":"private-reply"}}]}\n\n',
      ),
  }).createStream(connection, { operation: "日记生成" });
  const result = await (
    await stream(
      model,
      { messages: [{ role: "user", content: "private-prompt", timestamp: 0 }] },
      { maxTokens: 10240 },
    )
  ).result();
  assert.equal(result.stopReason, "error");
  assert.match(result.errorMessage!, /tool_calls/);
  assert.deepEqual(
    logs.map((entry) => entry.event),
    ["request", "response", "error"],
  );
  assert.equal(logs[0]!.operation, "日记生成");
  assert.equal(logs[0]!.maxTokens, 10240);
  assert.equal(logs[1]!.status, 200);
  assert.equal(logs[0]!.requestId, logs[2]!.requestId);
  const details = logs[2]!.streamEvent as { delta: Record<string, unknown> };
  assert.deepEqual(details.delta.tool_calls, { type: "object" });
  const serialized = JSON.stringify(logs);
  for (const secret of ["private-key", "private-header", "private-prompt"])
    assert.ok(!serialized.includes(secret));
  assert.ok(serialized.includes("private-reply"));
  assert.ok(serialized.includes("private-thought"));
});

test("completed request logs share an id and report output size and finish reason", async () => {
  const logs: Readonly<Record<string, unknown>>[] = [];
  const stream = createStAiTransport(() => ({}), {
    log: (entry) => logs.push(entry),
    fetchImpl: async () => new Response(wire),
  }).createStream(
    { baseUrl: "https://example.com", apiKey: "", customHeaders: {} },
    { operation: "连接测试" },
  );
  const result = await (await stream(model, { messages: [] })).result();
  assert.equal(result.stopReason, "stop");
  assert.deepEqual(
    logs.map((entry) => entry.event),
    ["request", "response", "complete"],
  );
  assert.equal(new Set(logs.map((entry) => entry.requestId)).size, 1);
  assert.equal(logs[2]!.textCharacters, 2);
  assert.equal(logs[2]!.stopReason, "stop");
});
test("transport binds credentials at creation and isolates simultaneous streams and application parameters", async () => {
  const requests: Record<string, unknown>[] = [];
  const transport = createStAiTransport(() => ({}), {
    fetchImpl: async (_, options) => {
      requests.push(JSON.parse(options!.body as string));
      return new Response(wire);
    },
  });
  const connection = {
    baseUrl: "https://example.com/v1",
    apiKey: "original",
    customHeaders: { "X-Account": "first" },
  };
  const stream = transport.createStream(connection);
  connection.apiKey = "edited";
  connection.customHeaders["X-Account"] = "edited";
  const [first, second] = await Promise.all([
    Promise.resolve(
      stream(
        model,
        { messages: [{ role: "user", content: "A", timestamp: 0 }] },
        { maxTokens: 23, temperature: 0.4 },
      ),
    ).then((value) => value.result()),
    Promise.resolve(
      stream(
        { ...model, id: "other" },
        { messages: [{ role: "user", content: "B", timestamp: 0 }] },
        { maxTokens: 5 },
      ),
    ).then((value) => value.result()),
  ]);
  assert.equal(first.model, "application-model");
  assert.equal(second.model, "other");
  assert.deepEqual(
    requests.map((value) => value.max_tokens),
    [23, 5],
  );
  assert.equal(requests[0]!.temperature, 0.4);
  assert.deepEqual(JSON.parse(requests[0]!.custom_include_headers as string), {
    Authorization: "Bearer original",
    "X-Account": "first",
  });
});
test("tools and reasoning options reach the ST protocol without application restrictions", async () => {
  let requests = 0;
  const stream = createStAiTransport(() => ({}), {
    fetchImpl: async () => {
      requests++;
      return new Response(wire);
    },
  }).createStream({ baseUrl: "https://example.com", apiKey: "", customHeaders: {} });
  const toolRun = await stream(model, {
    messages: [],
    tools: [
      { name: "unsupported", description: "", parameters: { type: "object", properties: {} } },
    ],
  });
  assert.equal((await toolRun.result()).stopReason, "stop");
  const reasoningRun = await stream(model, { messages: [] }, { reasoning: "low" });
  assert.equal((await reasoningRun.result()).stopReason, "stop");
  assert.equal(requests, 2);
});

test("transport sends explicit authentication and custom Authorization overrides case-insensitively", async () => {
  for (const [apiKey, customHeaders, expected] of [
    ["", {}, { Authorization: "" }],
    ["phone-key", {}, { Authorization: "Bearer phone-key" }],
    [
      "phone-key",
      { authorization: "", "X-Tag": " raw value " },
      { Authorization: "", "X-Tag": " raw value " },
    ],
    ["phone-key", { aUtHoRiZaTiOn: "Custom private" }, { Authorization: "Custom private" }],
  ] as const) {
    const transport = createStAiTransport(() => ({}), {
      fetchImpl: async (_, options) => {
        const body = JSON.parse(options!.body as string);
        assert.deepEqual(JSON.parse(body.custom_include_headers), expected);
        return new Response(wire);
      },
    });
    const stream = await transport.createStream({
      baseUrl: "https://example.com",
      apiKey,
      customHeaders,
    })(model, { messages: [] });
    assert.equal((await stream.result()).stopReason, "stop");
  }
});

test("transport propagates caller cancellation and timeout to pending reads", async () => {
  for (const timeout of [false, true]) {
    let canceled = false;
    let responseStarted!: () => void;
    const started = new Promise<void>((accept) => {
      responseStarted = accept;
    });
    const streamFn = createStAiTransport(() => ({}), {
      fetchImpl: async () => {
        responseStarted();
        return new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              canceled = true;
            },
          }),
        );
      },
    }).createStream({ baseUrl: "https://example.com", apiKey: "", customHeaders: {} });
    const controller = new AbortController();
    // Keep the Node test process alive while the platform's timeout signal waits.
    const keepAlive = setTimeout(() => {}, 1000);
    try {
      const stream = await streamFn(
        model,
        { messages: [] },
        { signal: controller.signal, ...(timeout ? { timeoutMs: 15 } : {}) },
      );
      await started;
      if (!timeout) controller.abort();
      const result = await stream.result();
      assert.equal(result.stopReason, "aborted");
      assert.match(result.errorMessage!, timeout ? /超时/ : /取消/);
      assert.equal(canceled, true);
    } finally {
      clearTimeout(keepAlive);
    }
  }
});
