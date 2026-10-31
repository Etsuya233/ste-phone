import assert from "node:assert/strict";
import test from "node:test";
import { createModelConnectionTest } from "../../apps/settings/model-connection-test.ts";
import { createStAiTransport } from "./ai-transport.ts";
function createStModelConnectionTest(
  headers: () => Record<string, string>,
  options: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
) {
  return createModelConnectionTest(createStAiTransport(headers, options), options);
}
import type { ModelConnection } from "../../apps/settings/model-connections.ts";
import {
  PhoneSettingsService,
  type SettingsStorage,
} from "../../apps/settings/settings-service.ts";

function connection(): ModelConnection {
  return {
    id: "connection-a",
    name: "Local test",
    baseUrl: "http://127.0.0.1:3000/v1",
    apiKey: "test-api-secret",
    model: "model-a",
    customHeaders: { "X-Provider": "custom-provider", authorization: "custom-auth-secret" },
  };
}

const encoder = new TextEncoder();
const event = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] })}\n\n`;
const end = (reason = "stop") =>
  `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })}\n\ndata: [DONE]\n\n`;
const sse = (wire = event("Hello!") + end()) =>
  new Response(wire, { headers: { "Content-Type": "text/event-stream" } });

test("connection test runs a Pi Agent through the ST Custom proxy with a fixed private-free prompt", async () => {
  let requests = 0;
  const updates: string[] = [];
  const run = createStModelConnectionTest(() => ({ "X-CSRF-Token": "csrf-test" }), {
    fetchImpl: async (url, options) => {
      requests++;
      assert.equal(url, "/api/backends/chat-completions/generate");
      assert.equal(options!.method, "POST");
      assert.deepEqual(options!.headers, { "X-CSRF-Token": "csrf-test" });
      const body = JSON.parse(options!.body as string);
      assert.equal(body.chat_completion_source, "custom");
      assert.equal(body.custom_url, "http://127.0.0.1:3000/v1");
      assert.equal(body.model, "model-a");
      assert.deepEqual(JSON.parse(body.custom_include_headers), {
        Authorization: "custom-auth-secret",
        "X-Provider": "custom-provider",
      });
      assert.equal(body.stream, true);
      assert.equal(body.max_tokens, 64);
      assert.equal("temperature" in body, false);
      assert.equal("tools" in body, false);
      assert.deepEqual(body.messages, [
        { role: "system", content: "Reply with a short greeting." },
        { role: "user", content: "Hello." },
      ]);
      // ST forwards the bytes without copying the upstream Content-Type.
      return new Response(encoder.encode(event("Hel") + event("lo!") + end()));
    },
  });
  assert.deepEqual(
    await run(connection(), new AbortController().signal, (text) => updates.push(text)),
    { text: "Hello!", truncated: false },
  );
  assert.deepEqual(updates, ["Hel", "Hello!"]);
  assert.equal(requests, 1);
});

test("default selection is consumed and an active test owns its independent connection snapshot", async () => {
  const storage: SettingsStorage = {
    read: () => undefined,
    save: () => {},
    listWallpapers: async () => [],
    uploadWallpaper: async () => {
      throw new Error("unused");
    },
    imageUrl: (path) => path,
  };
  const settings = new PhoneSettingsService(storage);
  const first = connection();
  const second = { ...connection(), id: "connection-b", model: "model-b" };
  settings.saveModelConnection(first);
  settings.saveModelConnection(second);
  settings.selectDefaultModelConnection(second.id);
  let release: () => void = () => {};
  const requestStarted = new Promise<void>((accept) => {
    release = accept;
  });
  const seen: string[] = [];
  let bodyStream: ReadableStreamDefaultController<Uint8Array>;
  const run = createStModelConnectionTest(() => ({}), {
    fetchImpl: async (_, options) => {
      const body = JSON.parse(options!.body as string);
      seen.push(body.model);
      release();
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            bodyStream = controller;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      );
    },
  });
  const chosen = settings.defaultModelConnection();
  const promise = run(chosen, new AbortController().signal);
  await requestStarted;
  chosen.model = "changed-after-start";
  chosen.customHeaders.authorization = "changed-after-start";
  settings.selectDefaultModelConnection(first.id);
  settings.deleteModelConnection(second.id);
  bodyStream!.enqueue(encoder.encode(event("Hello!") + end()));
  assert.deepEqual(await promise, { text: "Hello!", truncated: false });
  assert.deepEqual(seen, ["model-b"]);
  assert.equal(settings.defaultModelConnection().model, "model-a");
});

test("empty authentication is explicit and length completion is reported", async () => {
  const input = { ...connection(), apiKey: "", customHeaders: {} };
  const run = createStModelConnectionTest(() => ({}), {
    fetchImpl: async (_, options) => {
      const body = JSON.parse(options!.body as string);
      assert.deepEqual(JSON.parse(body.custom_include_headers), { Authorization: "" });
      return sse(event("Hi") + end("length"));
    },
  });
  assert.deepEqual(await run(input, new AbortController().signal), {
    text: "Hi",
    truncated: true,
  });
});

test("test errors retain original response details and credentials without retrying", async () => {
  const secretError = `failure ${connection().apiKey} custom-auth-secret custom-provider`;
  const responses = [
    new Response("private raw response", { status: 401 }),
    Response.json({ error: { message: secretError } }),
    new Response(encoder.encode(JSON.stringify({ error: { message: secretError } }))),
    sse(`data: ${JSON.stringify({ error: { message: secretError } })}\n\n`),
    sse(event("partial") + "data: [DONE]\n\n"),
  ];
  for (const response of responses) {
    let requests = 0;
    const run = createStModelConnectionTest(() => ({}), {
      fetchImpl: async () => {
        requests++;
        return response;
      },
    });
    await assert.rejects(run(connection(), new AbortController().signal), (error: Error) => {
      assert.match(
        error.message,
        /test-api-secret|custom-auth-secret|custom-provider|private raw|缺少结束原因/,
      );
      return true;
    });
    assert.equal(requests, 1);
  }
});

test("invalid input and already canceled tests fail without issuing a request", async () => {
  let requests = 0;
  const run = createStModelConnectionTest(() => ({}), {
    fetchImpl: async () => {
      requests++;
      return sse();
    },
  });
  await assert.rejects(run({ ...connection(), model: "" }, new AbortController().signal), /模型/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(run(connection(), controller.signal), { name: "AbortError" });
  assert.equal(requests, 0);
});

test("connection test accepts thinking blocks and rejects unexpected tools in its own application", async () => {
  const thought = 'data: {"choices":[{"delta":{"reasoning_content":"thought"}}]}\n\n';
  const successful = createStModelConnectionTest(() => ({}), {
    fetchImpl: async () => sse(thought + event("Hello") + end()),
  });
  assert.deepEqual(await successful(connection(), new AbortController().signal), {
    text: "Hello",
    truncated: false,
  });
  let requests = 0;
  const unexpected = createStModelConnectionTest(() => ({}), {
    fetchImpl: async () => {
      requests++;
      return sse(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call","function":{"name":"unregistered","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n',
      );
    },
  });
  await assert.rejects(unexpected(connection(), new AbortController().signal), (error: Error) => {
    assert.match(error.message, /连接测试未注册工具.*unregistered/);
    assert.ok(error.cause);
    return true;
  });
  assert.equal(requests, 1);
  const empty = createStModelConnectionTest(() => ({}), {
    fetchImpl: async () => sse(thought + end()),
  });
  await assert.rejects(empty(connection(), new AbortController().signal), /空回复/);
});

test("total timeout and user cancel stop a pending stream and settle the Pi run", async () => {
  for (const timeout of [true, false]) {
    let canceled = false;
    let started: () => void = () => {};
    const responseStarted = new Promise<void>((accept) => {
      started = accept;
    });
    const run = createStModelConnectionTest(() => ({}), {
      timeoutMs: timeout ? 15 : 60_000,
      fetchImpl: async () => {
        started();
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode(event("partial")));
            },
            cancel() {
              canceled = true;
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        );
      },
    });
    const controller = new AbortController();
    const promise = run(connection(), controller.signal);
    await responseStarted;
    if (!timeout) controller.abort();
    await assert.rejects(promise, timeout ? /超时/ : /取消/);
    assert.equal(canceled, true);
  }
});
