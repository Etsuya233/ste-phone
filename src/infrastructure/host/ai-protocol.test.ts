import assert from "node:assert/strict";
import test from "node:test";
import { Agent } from "@earendil-works/pi-agent-core";
import { Type, type Model } from "@earendil-works/pi-ai";
import { createStAiTransport } from "./ai-transport.ts";

const model: Model<"openai-completions"> = {
  id: "protocol-test",
  name: "Protocol",
  api: "openai-completions",
  provider: "test",
  baseUrl: "unused",
  reasoning: true,
  input: ["text"],
  contextWindow: 0,
  maxTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const connection = {
  baseUrl: "https://example.com/v1",
  apiKey: "literal-api-key",
  customHeaders: {},
};
const event = (delta: unknown, finish_reason: string | null = null) =>
  `data: ${JSON.stringify({ choices: [{ delta, finish_reason }] })}\n\n`;

test("Pi executes a complete tool roundtrip through ST request and response conversion", async () => {
  const bodies: Record<string, unknown>[] = [];
  let executions = 0;
  const transport = createStAiTransport(() => ({}), {
    log: () => {},
    fetchImpl: async (_, init) => {
      const body = JSON.parse(init!.body as string);
      bodies.push(body);
      return new Response(
        bodies.length === 1
          ? event({
              tool_calls: [
                {
                  index: 0,
                  id: "call-1",
                  type: "function",
                  function: { name: "lookup", arguments: '{"name":' },
                },
              ],
            }) +
              event(
                { tool_calls: [{ index: 0, function: { arguments: '"Alice"}' } }] },
                "tool_calls",
              ) +
              "data: [DONE]\n\n"
          : event({ reasoning_content: "thought", content: "完成" }, "stop") + "data: [DONE]\n\n",
      );
    },
  });
  const agent = new Agent({
    initialState: {
      model,
      tools: [
        {
          name: "lookup",
          label: "查询",
          description: "lookup",
          parameters: Type.Object({ name: Type.String() }),
          execute: async (_id, args) => {
            executions++;
            assert.equal((args as { name: string }).name, "Alice");
            return { content: [{ type: "text", text: "found" }], details: {} };
          },
        },
      ],
    },
    streamFn: transport.createStream(connection),
  });
  await agent.prompt("lookup");
  assert.equal(executions, 1);
  assert.equal(bodies.length, 2);
  assert.equal((bodies[0]!.tools as { function: { name: string } }[])[0]!.function.name, "lookup");
  const history = bodies[1]!.messages as {
    role: string;
    tool_calls?: unknown;
    tool_call_id?: string;
    content?: string;
  }[];
  assert.ok(history.some((message) => message.role === "assistant" && message.tool_calls));
  assert.ok(
    history.some(
      (message) =>
        message.role === "tool" && message.tool_call_id === "call-1" && message.content === "found",
    ),
  );
  const reply = agent.state.messages.at(-1)!;
  assert.equal(reply.role, "assistant");
  if (reply.role === "assistant") {
    assert.ok(reply.content.some((block) => block.type === "text" && block.text === "完成"));
  }
});

test("HTTP errors preserve the complete response and original credentials in Pi diagnostics", async () => {
  const body = JSON.stringify({
    error: {
      message: "failure literal-api-key " + "x".repeat(600),
      code: "bad_parameter",
      param: "tools",
    },
  });
  const logs: Readonly<Record<string, unknown>>[] = [];
  const stream = createStAiTransport(() => ({}), {
    log: (entry) => logs.push(entry),
    fetchImpl: async () => new Response(body, { status: 400 }),
  }).createStream(connection);
  const reply = await (await stream(model, { messages: [] })).result();
  assert.ok(reply.errorMessage!.includes(body));
  assert.equal(reply.diagnostics?.at(-1)?.details?.responseBody, body);
  assert.ok(logs.some((entry) => entry.responseBody === body));
});

test("network failures preserve the actual thrown object and its cause through Pi", async () => {
  const original = new TypeError("network literal-api-key", { cause: new Error("socket closed") });
  const reply = await (
    await createStAiTransport(() => ({}), {
      log: () => {},
      fetchImpl: async () => {
        throw original;
      },
    }).createStream(connection)(model, { messages: [] })
  ).result();
  assert.ok(reply.errorMessage!.includes(original.message));
  assert.equal(reply.diagnostics?.at(-1)?.details?.originalError, original);
});

test("SSE errors preserve every upstream error field and malformed JSON keeps its SyntaxError", async () => {
  const payload = JSON.stringify({
    error: {
      message: "literal-api-key",
      code: "quota",
      type: "request_error",
      param: "model",
      details: "x".repeat(700),
    },
  });
  for (const source of [`data: ${payload}\n\n`, "data: {broken payload}\n\n"]) {
    const reply = await (
      await createStAiTransport(() => ({}), {
        log: () => {},
        fetchImpl: async () => new Response(source),
      }).createStream(connection)(model, { messages: [] })
    ).result();
    assert.equal(reply.stopReason, "error");
    const error = reply.diagnostics!.at(-1)!.details!.originalError as Error;
    if (source.includes("broken")) {
      assert.match(reply.errorMessage!, /broken payload/);
      assert.ok(error.cause instanceof SyntaxError);
    } else {
      assert.ok(reply.errorMessage!.includes(payload));
      assert.deepEqual(error.cause, JSON.parse(payload).error);
    }
  }
});

test("parallel tool call fragments retain separate identities and complete arguments", async () => {
  const wire =
    event({
      tool_calls: [
        { index: 0, id: "one", function: { name: "lookup", arguments: '{"n":' } },
        { index: 1, id: "two", function: { name: "lookup", arguments: '{"n":' } },
      ],
    }) +
    event(
      {
        tool_calls: [
          { index: 1, function: { arguments: "2}" } },
          { index: 0, function: { arguments: "1}" } },
        ],
      },
      "tool_calls",
    ) +
    "data: [DONE]\n\n";
  const reply = await (
    await createStAiTransport(() => ({}), {
      log: () => {},
      fetchImpl: async () => new Response(wire),
    }).createStream(connection)(model, { messages: [] })
  ).result();
  assert.equal(reply.stopReason, "toolUse");
  assert.deepEqual(
    reply.content
      .filter((block) => block.type === "toolCall")
      .map((call) => [call.id, call.arguments]),
    [
      ["one", { n: 1 }],
      ["two", { n: 2 }],
    ],
  );
});

test("stream cleanup failures do not replace the original protocol failure", async () => {
  const cleanup = new Error("cancel failed");
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: {broken}\n\n"));
      },
      cancel() {
        throw cleanup;
      },
    }),
  );
  const reply = await (
    await createStAiTransport(() => ({}), {
      log: () => {},
      fetchImpl: async () => response,
    }).createStream(connection)(model, { messages: [] })
  ).result();
  assert.match(reply.errorMessage!, /无效 JSON.*broken/);
  assert.equal(
    reply.diagnostics?.find((entry) => entry.type === "stream_cleanup_error")?.details
      ?.originalError,
    cleanup,
  );
  assert.ok(
    (reply.diagnostics!.at(-1)!.details!.originalError as Error).cause instanceof SyntaxError,
  );
});

test("legacy function calls map to Pi toolUse and malformed complete arguments retain their input", async () => {
  for (const [args, succeeds] of [
    ["{}", true],
    ['{"incomplete":', false],
  ] as const) {
    const source =
      event({ function_call: { name: "lookup", arguments: args } }, "function_call") +
      "data: [DONE]\n\n";
    const reply = await (
      await createStAiTransport(() => ({}), {
        log: () => {},
        fetchImpl: async () => new Response(source),
      }).createStream(connection)(model, { messages: [] })
    ).result();
    assert.equal(reply.stopReason, succeeds ? "toolUse" : "error");
    if (!succeeds) {
      assert.ok(reply.errorMessage!.includes(args));
      assert.ok(
        (reply.diagnostics!.at(-1)!.details!.originalError as Error).cause instanceof SyntaxError,
      );
    }
  }
});
