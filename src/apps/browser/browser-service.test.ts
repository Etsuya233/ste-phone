import assert from "node:assert/strict";
import test from "node:test";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import type { AiTransport } from "../../core/ai/public.ts";
import type { ChatContext, PhoneChat } from "../../core/chat/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type { ModelConnectionsReader, ModelConnectionSnapshot } from "../settings/public.ts";
import { BrowserService } from "./browser-service.ts";
import { readBrowserData, type BrowserData, type BrowserStorage } from "./browser.ts";

const author = { sourceId: "memory", scopeId: "stable", id: "red", name: "小红" };
const source = { html: "<h1>手改</h1>", css: "h1{color:blue}", js: 'console.log("</script>")' };
const output = JSON.stringify({ ...source, title: "新版", reply: "已修改" });

function setup() {
  let chat: PhoneChat = { id: "a", name: "A" };
  let chatChanged!: () => void;
  let dataChanged!: () => void;
  let scopeId = "current";
  const chats: ChatContext = {
    getSnapshot: () => chat,
    subscribe(listener) {
      chatChanged = listener;
      return () => {};
    },
  };
  const data = {
    getSnapshot: () => ({
      context: { available: true, sourceName: "Memory", scopeId, chatIdentity: chat.id },
    }),
    subscribe(listener: () => void) {
      dataChanged = listener;
      return () => {};
    },
    describe: async () => ({ sourceId: author.sourceId, stableScopeId: author.scopeId }),
    readCharacters: async () => [{ ...author, profileText: "文学社成员" }],
  } as unknown as DataAppPublic;
  const saved = new Map<string, BrowserData>();
  const storage: BrowserStorage = {
    read: (id) => saved.get(id) ?? null,
    async write(id, value) {
      saved.set(id, value);
    },
  };
  let model: ModelConnectionSnapshot = {
    id: "browser",
    name: "浏览器模型",
    baseUrl: "https://example.invalid",
    apiKey: "before",
    model: "initial",
    customHeaders: {},
  };
  const connections = { getConnection: () => model } as unknown as ModelConnectionsReader;
  const requests: {
    key: string;
    model: string;
    prompt: string;
    think: (text: string) => void;
    finish: (stopReason?: "stop" | "length" | "error", text?: string) => void;
  }[] = [];
  const transport: AiTransport = {
    createStream(connection) {
      return (requestModel, context) => {
        const stream = createAssistantMessageEventStream();
        const user = context.messages.at(-1)!;
        assert.equal(user.role, "user");
        const prompt =
          typeof user.content === "string"
            ? user.content
            : user.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
        let thinking = "";
        requests.push({
          key: connection.apiKey,
          model: requestModel.id,
          prompt,
          think(text) {
            thinking = text;
            const partial: AssistantMessage = {
              role: "assistant",
              api: requestModel.api,
              provider: requestModel.provider,
              model: requestModel.id,
              timestamp: Date.now(),
              stopReason: "stop",
              content: [{ type: "thinking", thinking }],
              usage: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 0,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
            };
            stream.push({ type: "start", partial });
            stream.push({ type: "thinking_delta", contentIndex: 0, delta: text, partial });
          },
          finish(stopReason = "stop", text = output) {
            const message: AssistantMessage = {
              role: "assistant",
              api: requestModel.api,
              provider: requestModel.provider,
              model: requestModel.id,
              timestamp: Date.now(),
              stopReason,
              content: [
                ...(thinking ? [{ type: "thinking" as const, thinking }] : []),
                { type: "text", text },
              ],
              ...(stopReason === "error" ? { errorMessage: "模拟请求失败" } : {}),
              usage: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                totalTokens: 0,
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
              },
            };
            if (stopReason === "error") {
              stream.push({ type: "error", reason: stopReason, error: message });
            } else {
              stream.push({ type: "done", reason: stopReason, message });
            }
          },
        });
        return stream;
      };
    },
  };
  const service = new BrowserService({ chat: chats, data, storage, transport, connections });
  const create = () => service.create(author, service.getSnapshot().authorRevision);
  return {
    service,
    create,
    saved,
    storage,
    requests,
    switchChat(id: string) {
      chat = { id, name: id };
      chatChanged();
    },
    switchSource() {
      scopeId = "replacement";
      dataChanged();
    },
    changeModel() {
      model = { ...model, model: "updated", apiKey: "after" };
    },
  };
}

const nextTick = () => new Promise<void>((resolve) => setImmediate(resolve));

test("生成固定连接快照并发送手改源码，仅显式保存确认一个版本", async () => {
  const { service, create, changeModel, requests, saved } = setup();
  const id = create();
  service.edit(id, { source });
  service.setInstruction(id, "更新标题");
  const task = service.generate(id, "browser");
  changeModel();
  await nextTick();
  assert.equal(requests[0]!.key, "before");
  assert.equal(requests[0]!.model, "initial");
  assert.deepEqual(JSON.parse(requests[0]!.prompt).source, source);
  requests[0]!.finish();
  assert.equal(await task, true);
  assert.equal(saved.size, 0);
  assert.equal(service.getSnapshot().instructions.has(id), false);
  await service.save(id);
  const work = saved.get("a")!.works[0]!;
  assert.equal(work.versions.length, 1);
  assert.deepEqual(work.turns, [{ instruction: "更新标题", reply: "已修改" }]);
  service.edit(id, { source: { ...source, html: "新版的手动修改" } });
  service.restore(id, work.versions[0]!);
  assert.deepEqual(service.getSnapshot().drafts.get(id)?.source, source);
  assert.deepEqual(service.getSnapshot().drafts.get(id)?.turns, work.turns);
  service.discard(id);
  assert.equal(service.getSnapshot().drafts.has(id), false);
});

test("截断、资料空间切换与停止保留保存内容及输入，丢弃迟到回复", async () => {
  const { service, create, requests, saved, switchSource } = setup();
  const id = create();
  await service.save(id);
  const confirmed = saved.get("a");
  service.setInstruction(id, "保留本次指令");
  const clipped = service.generate(id, "browser");
  await nextTick();
  requests[0]!.finish("length");
  assert.equal(await clipped, false);
  assert.match(service.getSnapshot().error!, /输出上限/);
  const oldRevision = service.getSnapshot().authorRevision;
  const cancelled = service.generate(id, "browser");
  await nextTick();
  switchSource();
  assert.throws(() => service.create(author, oldRevision), /人物资料已更新/);
  requests[1]!.finish();
  assert.equal(await cancelled, false);
  assert.equal(service.getSnapshot().instructions.get(id), "保留本次指令");
  assert.equal(service.getSnapshot().drafts.has(id), false);
  assert.equal(saved.get("a"), confirmed);
});

test("保存失败可重试，切聊天后待确认写入仍归发起时的聊天", async () => {
  const { service, create, storage, switchChat, saved } = setup();
  const id = create();
  storage.write = async () => {
    throw new Error("保存失败");
  };
  await service.save(id);
  assert.equal(service.getSnapshot().error, "保存失败");
  assert.equal(service.getSnapshot().drafts.has(id), true);
  const pending = Promise.withResolvers<void>();
  storage.write = async (chatId, value) => {
    await pending.promise;
    saved.set(chatId, value);
  };
  const saving = service.save(id);
  switchChat("b");
  pending.resolve();
  await saving;
  assert.equal(service.getSnapshot().chatId, "b");
  assert.deepEqual(service.getSnapshot().saved.works, []);
  assert.equal(saved.get("a")!.works[0]!.id, id);
  switchChat("a");
  assert.equal(service.getSnapshot().drafts.size, 0);
  assert.equal(service.getSnapshot().saved.works[0]!.id, id);
});

test("损坏的作品数据和读取失败的工作区不允许写入", () => {
  assert.throws(() => readBrowserData({ version: 1, works: [{ id: "bad" }] }), /数据格式无效/);
  const { service, storage, switchChat, create } = setup();
  storage.read = () => {
    throw new Error("元数据不可用");
  };
  switchChat("broken");
  assert.equal(service.getSnapshot().readError, "元数据不可用");
  assert.throws(create, /元数据不可用/);
});

test("模型失败、非法回复和显式停止都保留本次指令与手改草稿", async () => {
  const { service, create, requests } = setup();
  const id = create();
  service.edit(id, { source });
  service.setInstruction(id, "仍需修改");
  const failed = service.generate(id, "browser");
  await nextTick();
  requests[0]!.finish("error");
  assert.equal(await failed, false);
  assert.equal(service.getSnapshot().error, "模拟请求失败");
  const invalid = service.generate(id, "browser");
  await nextTick();
  requests[1]!.finish("stop", JSON.stringify({ title: "少了字段" }));
  assert.equal(await invalid, false);
  assert.match(service.getSnapshot().error!, /完整的 HTML/);
  const stopped = service.generate(id, "browser");
  await nextTick();
  service.stop();
  requests[2]!.finish();
  assert.equal(await stopped, false);
  assert.equal(service.getSnapshot().instructions.get(id), "仍需修改");
  assert.equal(service.getSnapshot().drafts.get(id)?.source, source);
  assert.deepEqual(service.getSnapshot().drafts.get(id)?.turns, []);
});

test("创作过程属于发起的作品，停止后的模型内容不会进入该作品或其他作品", async () => {
  const { service, create, requests } = setup();
  const first = create();
  const second = create();
  service.setInstruction(first, "生成网页");
  const task = service.generate(first, "browser");
  await nextTick();
  const firstRun = service.getSnapshot().activities.get(first)!;
  assert.equal(firstRun.status, "running");
  assert.equal(service.getSnapshot().activities.has(second), false);
  requests[0]!.think("模型返回的过程");
  await nextTick();
  assert.deepEqual(service.getSnapshot().activities.get(first), {
    runId: firstRun.runId,
    status: "running",
    thinking: "模型返回的过程",
  });
  requests[0]!.finish();
  assert.equal(await task, true);
  assert.deepEqual(service.getSnapshot().activities.get(first), {
    runId: firstRun.runId,
    status: "done",
    thinking: "模型返回的过程",
  });
  service.setInstruction(second, "另做一个网页");
  const stopped = service.generate(second, "browser");
  await nextTick();
  const secondRun = service.getSnapshot().activities.get(second)!;
  service.stop();
  requests[1]!.think("迟到内容");
  requests[1]!.finish();
  assert.equal(await stopped, false);
  assert.deepEqual(service.getSnapshot().activities.get(second), {
    runId: secondRun.runId,
    status: "stopped",
    thinking: "",
  });
  assert.equal(service.getSnapshot().activities.get(first)?.thinking, "模型返回的过程");
  const retry = service.generate(second, "browser");
  await nextTick();
  assert.notEqual(service.getSnapshot().activities.get(second)?.runId, secondRun.runId);
  requests[2]!.finish();
  assert.equal(await retry, true);
});
