import assert from "node:assert/strict";
import test from "node:test";
import { readOpenAiTextStream } from "./openai-text-stream.ts";

const encoder = new TextEncoder();
const textEvent = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] })}\n\n`;
const finish = (reason = "stop") =>
  `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })}\n\ndata: [DONE]\n\n`;

function streamedResponse(bytes: Uint8Array[], close = true, onCancel = () => {}) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of bytes) controller.enqueue(chunk);
        if (close) controller.close();
      },
      cancel: onCancel,
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}

test("OpenAI text SSE handles UTF-8 and CRLF boundaries, multiline data and an open body", async () => {
  const wire = (
    ": heartbeat\n\n" +
    textEvent("你好") +
    'data: {"choices":\ndata: [{"delta":{"content":"！"},"finish_reason":null}]}\n\n' +
    finish()
  ).replaceAll("\n", "\r\n");
  let canceled = false;
  const bytes = encoder.encode(wire);
  const chunks = [...bytes].map((byte) => Uint8Array.of(byte));
  const updates: string[] = [];
  const result = await readOpenAiTextStream(
    streamedResponse(chunks, false, () => {
      canceled = true;
    }),
    new AbortController().signal,
    (text) => updates.push(text),
  );
  assert.deepEqual(result, { text: "你好！", truncated: false });
  assert.deepEqual(updates, ["你好", "你好！"]);
  assert.equal(canceled, true);
});

test("OpenAI text SSE marks output length and accepts a trailing usage-only event", async () => {
  const wire =
    textEvent("short") +
    'data: {"choices":[{"delta":{},"finish_reason":"length"}]}\n\n' +
    'data: {"choices":[],"usage":{"completion_tokens":64}}\n\n' +
    "data: [DONE]\n\n";
  assert.deepEqual(
    await readOpenAiTextStream(
      streamedResponse([encoder.encode(wire)]),
      new AbortController().signal,
      () => {},
    ),
    { text: "short", truncated: true },
  );
});

test("OpenAI text SSE rejects errors, missing termination and unsupported protocol content", async () => {
  const failures = [
    [textEvent("partial"), /缺少 \[DONE\]/],
    [textEvent("partial") + "data: [DONE]\n\n", /缺少结束原因/],
    [finish(), /空回复/],
    [textEvent("partial") + finish("tool_calls"), /不支持的结束原因/],
    ['data: {"error":{"message":"rate limit"}}\n\n', /rate limit/],
    ["data: {broken}\n\n", /无效 JSON/],
    ['data: {"choices":[{"delta":{"tool_calls":[]}}]}\n\n', /暂不支持工具/],
    ['data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\n', /思考内容/],
    ['data: {"choices":[{"delta":{"content":[]}}]}\n\n', /非文本/],
  ] as const;
  for (const [wire, pattern] of failures) {
    await assert.rejects(
      readOpenAiTextStream(
        streamedResponse([encoder.encode(wire)]),
        new AbortController().signal,
        () => {},
      ),
      pattern,
    );
  }
});

test("OpenAI text SSE abort cancels a pending read", async () => {
  const controller = new AbortController();
  let canceled = false;
  const completion = readOpenAiTextStream(
    streamedResponse([], false, () => {
      canceled = true;
    }),
    controller.signal,
    () => {},
  );
  controller.abort();
  await assert.rejects(completion, { name: "AbortError" });
  assert.equal(canceled, true);
});
