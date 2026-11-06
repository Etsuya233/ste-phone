import assert from "node:assert/strict";
import test from "node:test";
import { defaultSpeechConnection } from "../../core/speech/public.ts";
import { createBrowserSpeech } from "./speech.ts";

test("speech goes directly to the configured endpoint with its own key and style", async () => {
  const endpoint = "https://speech.example/v1/audio/speech";
  const connection = {
    ...defaultSpeechConnection,
    endpoint,
    apiKey: "bridge-token",
    voice: "cedar",
    speed: 0.9,
    volume: 0.5,
    instructions: "  轻声朗读  ",
  };
  const transport = createBrowserSpeech(async (url, init) => {
    assert.equal(url, endpoint);
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.redirect, "error");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer bridge-token");
    assert.deepEqual(JSON.parse(String(init?.body)), {
      model: connection.model,
      input: "测试",
      voice: "cedar",
      speed: 0.9,
      instructions: "轻声朗读",
      response_format: "mp3",
    });
    return new Response("ID3", { headers: { "Content-Type": "audio/mpeg" } });
  });
  assert.equal(
    (await transport.generate(connection, "测试", new AbortController().signal)).type,
    "audio/mpeg",
  );
});
