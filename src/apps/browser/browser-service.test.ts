import { BrowserConversations } from "./browser-conversations.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  createAssistantMessageEventStream,
  type ToolCall,
  type AssistantMessage,
} from "@earendil-works/pi-ai";
import type { AiTransport } from "../../core/ai/public.ts";
import type { ChatContext, PhoneChat } from "../../core/chat/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type { ModelConnectionsReader, ModelConnectionSnapshot } from "../settings/public.ts";
import { BrowserService } from "./browser-service.ts";
import { readBrowserData, type BrowserData, type BrowserStorage } from "./browser.ts";

const author = { sourceId: "memory", scopeId: "stable", id: "red", name: "小红" };
const source = { html: "<h1>手改</h1>", css: "h1{color:blue}", js: 'console.log("</script>")' };
const output = "已修改";

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
    results: { text: string; isError: boolean }[];
    tools: (calls: ToolCall[], truncated?: boolean, narration?: string) => void;
    think: (text: string) => void;
    finish: (stopReason?: "stop" | "length" | "error", text?: string) => void;
  }[] = [];
  const transport: AiTransport = {
    createStream(connection) {
      return (requestModel, context) => {
        const stream = createAssistantMessageEventStream();
        const user = context.messages.find((message) => message.role === "user")!;
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
          results: context.messages.flatMap((message) =>
            message.role === "toolResult"
              ? [
                  {
                    isError: message.isError,
                    text: message.content
                      .flatMap((part) => (part.type === "text" ? [part.text] : []))
                      .join(""),
                  },
                ]
              : [],
          ),
          tools(calls, truncated, narration) {
            const stopReason = truncated ? "length" : "toolUse";
            stream.push({
              type: "done",
              reason: stopReason,
              message: {
                role: "assistant",
                api: requestModel.api,
                provider: requestModel.provider,
                model: requestModel.id,
                timestamp: Date.now(),
                stopReason,
                content: narration ? [{ type: "text", text: narration }, ...calls] : calls,
                usage: {
                  input: 0,
                  output: 0,
                  cacheRead: 0,
                  cacheWrite: 0,
                  totalTokens: 0,
                  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
                },
              },
            });
          },
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
  const local = new Map<string, string>();
  const conversations = new BrowserConversations({
    getItem: (key) => local.get(key) ?? null,
    setItem: (key, value) => {
      local.set(key, value);
    },
  });
  const service = new BrowserService({
    chat: chats,
    data,
    storage,
    transport,
    connections,
    conversations,
  });
  const create = () => service.create(author, service.getSnapshot().authorRevision);
  return {
    service,
    conversations,
    reload: () =>
      new BrowserService({ chat: chats, data, storage, transport, connections, conversations }),
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

test("生成固定连接快照且无工具也可回复，仅显式保存确认一个版本", async () => {
  const { service, create, changeModel, requests, saved } = setup();
  const id = create();
  service.edit(id, { source });
  service.setInstruction(id, "更新标题");
  const task = service.generate(id, "browser");
  changeModel();
  await nextTick();
  assert.equal(requests[0]!.key, "before");
  assert.equal(requests[0]!.model, "initial");
  assert.equal(JSON.parse(requests[0]!.prompt).source, undefined);
  requests[0]!.finish();
  assert.equal(await task, true);
  assert.equal(saved.size, 0);
  assert.equal(service.getSnapshot().instructions.has(id), false);
  await service.save(id);
  const work = saved.get("a")!.works[0]!;
  assert.equal(work.versions.length, 1);
  assert.deepEqual(work.turns, []);
  const turns = service.getSnapshot().saved.works[0]!.turns;
  assert.equal(turns[0]!.instruction, "更新标题");
  service.edit(id, { source: { ...source, html: "新版的手动修改" } });
  service.restore(id, work.versions[0]!);
  assert.deepEqual(service.getSnapshot().drafts.get(id)?.source, source);
  assert.deepEqual(service.getSnapshot().drafts.get(id)?.turns, turns);
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
  requests[1]!.finish("stop", "");
  assert.equal(await invalid, false);
  assert.match(service.getSnapshot().error!, /最终回复/);
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
    turnIndex: 0,
    instruction: "生成网页",
    status: "running",
    steps: [{ kind: "thinking", id: "thinking-1", text: "模型返回的过程", running: true }],
  });
  requests[0]!.finish();
  assert.equal(await task, true);
  assert.deepEqual(service.getSnapshot().activities.get(first), {
    runId: firstRun.runId,
    turnIndex: 0,
    instruction: "生成网页",
    status: "done",
    steps: [{ kind: "thinking", id: "thinking-1", text: "模型返回的过程", running: false }],
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
    turnIndex: 0,
    instruction: "另做一个网页",
    status: "stopped",
    steps: [],
  });
  assert.equal(service.getSnapshot().activities.get(first)?.steps.length, 1);
  const retry = service.generate(second, "browser");
  await nextTick();
  assert.notEqual(service.getSnapshot().activities.get(second)?.runId, secondRun.runId);
  requests[2]!.finish();
  assert.equal(await retry, true);
});

const call = (id: string, name: string, args: Record<string, unknown>): ToolCall => ({
  type: "toolCall",
  id,
  name,
  arguments: args,
});

test("三文件工具串行读取手改内容、报告精确匹配错误并应用修正后的完整副本", async () => {
  const { service, create, requests, changeModel } = setup();
  const id = create();
  const initial = { ...source, html: "第一行\r\n重复\r重复" };
  service.edit(id, { source: initial });
  service.setInstruction(id, "修改网页");
  const task = service.generate(id, "browser");
  changeModel();
  await nextTick();
  requests[0]!.tools(
    [
      call("read", "read_file", { path: "index.html", start_line: 1, end_line: 2 }),
      call("path", "read_file", { path: "../index.html" }),
      call("range", "read_file", { path: "index.html", end_line: 4 }),
      call("multiple", "edit_file", { path: "index.html", old_text: "重复", new_text: "误改" }),
      call("zero", "edit_file", { path: "index.html", old_text: "不存在", new_text: "误改" }),
      call("fix", "edit_file", {
        path: "index.html",
        old_text: "第一行\r\n重复",
        new_text: "修正",
      }),
      call("write", "write_file", {
        path: "style.css",
        content: "main{color:red}",
        title: "新标题",
      }),
      call("updated", "read_file", { path: "index.html" }),
    ],
    false,
    "先读源码",
  );
  await nextTick();
  assert.equal(requests[1]!.model, "initial");
  assert.equal(requests[1]!.results[0]!.text, "第一行\r\n重复");
  assert.deepEqual(
    requests[1]!.results.map((result) => result.isError),
    [false, true, true, true, true, false, false, false],
  );
  assert.equal(requests[1]!.results.at(-1)!.text, "修正\r重复");
  assert.equal(service.getSnapshot().drafts.get(id)?.source, initial);
  const steps = service.getSnapshot().activities.get(id)!.steps;
  assert.deepEqual(
    steps.filter((step) => step.kind === "tool").map((step) => step.id),
    ["read", "path", "range", "multiple", "zero", "fix", "write", "updated"].map(
      (id) => `tool-${id}`,
    ),
  );
  assert.deepEqual(steps[0], { kind: "text", id: "text-1", text: "先读源码" });
  assert.equal(steps[4]?.kind === "tool" && steps[4].status, "failed");
  requests[1]!.finish("stop", "修改完成");
  assert.equal(await task, true);
  const draft = service.getSnapshot().drafts.get(id)!;
  assert.equal(draft.title, "新标题");
  assert.deepEqual(draft.source, { html: "修正\r重复", css: "main{color:red}", js: initial.js });
});

test("已经写过副本后遇到截断的工具调用，整轮失败且不继续请求", async () => {
  const { service, create, requests } = setup();
  const id = create();
  service.edit(id, { source });
  service.setInstruction(id, "改写网页");
  const task = service.generate(id, "browser");
  await nextTick();
  requests[0]!.tools([call("write", "write_file", { path: "index.html", content: "不应应用" })]);
  await nextTick();
  requests[1]!.tools([call("truncated", "write_file", { path: "script.js" })], true);
  assert.equal(await task, false);
  assert.match(service.getSnapshot().error!, /输出上限/);
  assert.equal(requests.length, 2);
  assert.equal(service.getSnapshot().drafts.get(id)?.source, source);
});

test("取消后晚到的写入工具不会修改作品或发起后续模型请求", async () => {
  const { service, create, requests } = setup();
  const id = create();
  service.edit(id, { source });
  service.setInstruction(id, "更新");
  const pending = service.generate(id, "browser");
  await nextTick();
  service.stop();
  requests[0]!.tools([call("late", "write_file", { path: "index.html", content: "迟到写入" })]);
  assert.equal(await pending, false);
  assert.equal(requests.length, 1);
  assert.equal(service.getSnapshot().drafts.get(id)?.source, source);
  assert.deepEqual(service.getSnapshot().activities.get(id)?.steps, []);
});

test("本机会话刷新保留所有轮次过程，清空不影响源码版本且不再发送历史", async () => {
  const { service, create, requests, saved, reload } = setup();
  const id = create();
  service.edit(id, { source });
  for (const instruction of ["第一轮", "第二轮"]) {
    service.setInstruction(id, instruction);
    const task = service.generate(id, "browser");
    await nextTick();
    requests.at(-1)!.think("检查源码");
    requests.at(-1)!.finish();
    assert.equal(await task, true);
  }
  await service.save(id);
  assert.deepEqual(saved.get("a")!.works[0]!.turns, []);
  const restored = reload();
  const work = restored.getSnapshot().saved.works[0]!;
  assert.equal(work.turns.length, 2);
  assert.ok(work.turns.every((turn) => turn.steps?.some((step) => step.kind === "thinking")));
  restored.clearConversation(id);
  assert.deepEqual(restored.getSnapshot().saved.works[0], { ...work, turns: [] });
  assert.equal(restored.getSnapshot().drafts.size, 0);
  const cleared = reload();
  assert.deepEqual(cleared.getSnapshot().saved.works[0]!.turns, []);
  assert.equal(cleared.getSnapshot().activities.size, 0);
  cleared.setInstruction(id, "重新开始");
  const task = cleared.generate(id, "browser");
  await nextTick();
  assert.deepEqual(JSON.parse(requests.at(-1)!.prompt).turns, []);
  assert.throws(() => cleared.clearConversation(id), /等待/);
  requests.at(-1)!.finish();
  await task;
});
