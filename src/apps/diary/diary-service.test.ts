import type { ImageHub, ImageRecord } from "../../core/image-hub/public.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import type { DataAppPublic, DataSourceSnapshot, SqlValue } from "../data-source/public.ts";
import type { ChatContext, PhoneChat } from "../../core/chat/public.ts";
import type { DiaryData } from "./diary.ts";
import { DiaryService } from "./diary-service.ts";
import { generateDiaryText } from "./diary-generation.ts";
import { createStAiTransport } from "../../infrastructure/host/ai-transport.ts";

const connection = {
  id: "model",
  name: "日记模型",
  model: "test-model",
  baseUrl: "http://localhost/v1",
  apiKey: "",
  customHeaders: {},
};
const event = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: null }] })}\n\n`;
const end = (reason = "stop") =>
  `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })}\n\ndata: [DONE]\n\n`;
const reply = (reason = "stop") =>
  new Response(
    event(JSON.stringify({ body: "今天的风让人安心。", imagePrompt: "海边的人物与晚风" })) +
      end(reason),
  );

function fixture(
  fetchImpl: typeof fetch = async () => reply(),
  imageHub: ImageHub = { listImages: async () => [], generate: async () => [] },
) {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE phone_characters(record_id TEXT,stable_record_id TEXT,name TEXT,profile_text TEXT);
    INSERT INTO phone_characters VALUES ('author','author','林','沉静，喜欢散步');
    CREATE TABLE phone_world_state(world_time TEXT,current_location TEXT,weather TEXT,clothing TEXT,other_scenes TEXT);
    INSERT INTO phone_world_state VALUES ('2026-10-31 23:00:00','海边','有风','外套','远处有人等车');
    CREATE TABLE phone_chronicles(record_id TEXT,title TEXT,content TEXT,start_time TEXT,end_time TEXT);
    CREATE TABLE phone_chronicle_characters(chronicle_id TEXT,character_id TEXT);
    INSERT INTO phone_chronicles VALUES ('bad','坏日期','不能输入','未知','未知'),('future','未来','不能输入','2026-11-01','2026-11-02'),('other','他人','不能输入','2026-10-30','2026-10-30');
    INSERT INTO phone_chronicle_characters VALUES ('bad','author'),('future','author'),('other','other');`);
  for (let day = 20; day <= 26; day++) {
    db.prepare("INSERT INTO phone_chronicles VALUES (?,?,?,?,?)").run(
      `day-${day}`,
      `纪要${day}`,
      `正文${day}`,
      `2026-10-${day}`,
      `2026-10-${day}`,
    );
    db.prepare("INSERT INTO phone_chronicle_characters VALUES (?,?)").run(`day-${day}`, "author");
  }
  const sourceListeners = new Set<() => void>();
  const chatListeners = new Set<() => void>();
  let current: PhoneChat | null = { id: "phone-A", name: "A" };
  let snapshot: DataSourceSnapshot = {
    sourceId: "ste-memory",
    context: {
      sourceName: "Memory",
      chatIdentity: "memory-A",
      chatName: "A",
      scopeId: "scope",
      spaceName: "剧情",
      available: true,
      message: null,
    },
    status: "idle",
    data: null,
    stale: false,
    error: null,
    loadedAt: null,
    revision: 0,
  };
  const chat: ChatContext = {
    getSnapshot: () => current,
    subscribe: (listener) => {
      chatListeners.add(listener);
      return () => chatListeners.delete(listener);
    },
  };
  let stableScopeId = "scope";
  const data: DataAppPublic = {
    readWorldState: async () => {
      throw new Error("日记使用自己的世界状态取材");
    },
    readRelatedBackground: async () => {
      throw new Error("日记不应依赖关联资料能力");
    },
    readSummary: async () => {
      throw new Error("日记不应读取剧情总结");
    },
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      sourceListeners.add(listener);
      return () => sourceListeners.delete(listener);
    },
    readBackground: async () => {
      throw new Error("日记不应依赖背景展示或物品表");
    },
    describe: async () => ({
      sourceId: "ste-memory",
      scopeId: snapshot.context.scopeId!,
      stableScopeId: stableScopeId,
      name: "剧情",
      schemaVersion: 1,
      schemaKey: "schema",
      databaseKey: "db",
      objects: [],
    }),
    query: async ({ sql, params }) => {
      const statement = db.prepare(sql);
      const records = params ? statement.all(params) : statement.all();
      return {
        columns: statement.columns().map((column) => column.name),
        rows: records.map((row) => Object.values(row) as SqlValue[]),
        elapsedMs: 0,
        truncated: false,
        maxRows: 200,
      };
    },
    readRecentChat: async (request) => {
      assert.equal(request.chatIdentity, "memory-A");
      assert.equal(request.count, 20);
      return {
        chatIdentity: "memory-A",
        messages: [{ floor: 5, name: "林", role: "assistant", content: "清洗后的海边散步正文" }],
        cleaning: { enabled: true, ruleId: "clean", ruleName: "正文" },
      };
    },
  };
  const saved = new Map<string, DiaryData>();
  let failSave = false;
  const service = new DiaryService({
    data,
    imageHub,
    chat,
    storage: {
      read: (id) => saved.get(id) ?? null,
      write: async (id, value) => {
        if (failSave) {
          throw new Error("磁盘失败");
        }
        saved.set(id, structuredClone(value));
      },
    },
    connections: {
      getSnapshot: () => ({ connections: [connection], defaultModelConnectionId: "model" }),
      getConnection: () => connection,
      subscribe: () => () => {},
    },
    transport: createStAiTransport(() => ({}), { fetchImpl }),
  });
  return {
    service,
    data,
    rebuildScope() {
      stableScopeId = "new-preset-origin";
      snapshot = { ...snapshot, revision: snapshot.revision + 1 };
      for (const listener of sourceListeners) {
        listener();
      }
    },
    importScope(nextStableScopeId = "scope") {
      stableScopeId = nextStableScopeId;
      db.exec(`UPDATE phone_characters SET record_id='imported-author';
        UPDATE phone_chronicle_characters SET character_id='imported-author' WHERE character_id='author'`);
      snapshot = { ...snapshot, context: { ...snapshot.context, scopeId: "imported-scope" } };
      for (const listener of sourceListeners) {
        listener();
      }
    },
    saved,
    db,
    failSave: () => {
      failSave = true;
    },
    restoreSave: () => {
      failSave = false;
    },
    switchChat: () => {
      current = { id: "phone-B", name: "B" };
      for (const listener of chatListeners) {
        listener();
      }
    },
    updateSource: () => {
      snapshot = { ...snapshot, revision: snapshot.revision + 1 };
      for (const listener of sourceListeners) {
        listener();
      }
    },
    close: () => {
      service.dispose();
      db.close();
    },
  };
}

test("diary selects recent finished author chronicles, cleaned chat and explicit model budget through Pi", async () => {
  const requests: Record<string, unknown>[] = [];
  const app = fixture(async (_, options) => {
    requests.push(JSON.parse(options!.body as string));
    return reply();
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    await app.service.saveSettings({ timeoutSeconds: 300, maxTokens: 8192 });
    await app.service.generate();
    const request = requests[0]!;
    assert.equal(request.max_tokens, 8192);
    assert.equal(request.model, "test-model");
    const messages = request.messages as { role: string; content: string }[];
    const prompt = JSON.parse(messages.find((message) => message.role === "user")!.content);
    assert.deepEqual(
      prompt.最近纪要.map((entry: { 标题: string }) => entry.标题),
      ["纪要22", "纪要23", "纪要24", "纪要25", "纪要26"],
    );
    assert.equal(prompt.最近聊天[0].正文, "清洗后的海边散步正文");
    assert.equal(app.service.getSnapshot().data.entries[0]!.worldTime, "2026-10-31 23:00:00");
    assert.equal(app.saved.get("phone-A")!.entries.length, 1);
    await app.service.generate();
    assert.equal(app.saved.get("phone-A")!.entries.length, 2);
    assert.notEqual(
      app.saved.get("phone-A")!.entries[0]!.id,
      app.saved.get("phone-A")!.entries[1]!.id,
    );
  } finally {
    app.close();
  }
});

test("diary reports a reasoning phase and saves only the final answer", async () => {
  const app = fixture(
    async () =>
      new Response(
        'data: {"choices":[{"delta":{"reasoning_content":"private-thought"}}]}\n\n' +
          event(JSON.stringify({ body: "今天的海风让人安心。", imagePrompt: "海边的人物与晚风" })) +
          end(),
      ),
  );
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    let sawThinking = false;
    const unsubscribe = app.service.subscribe(() => {
      const generation = app.service.getSnapshot().generation;
      sawThinking ||= generation.status === "generating" && generation.thinking;
    });
    await app.service.generate();
    unsubscribe();
    assert.ok(sawThinking);
    assert.equal(app.service.getSnapshot().generation.status, "complete");
    assert.equal(app.saved.get("phone-A")!.entries[0]!.body, "今天的海风让人安心。");
    assert.ok(!JSON.stringify(app.saved.get("phone-A")).includes("private-thought"));
  } finally {
    app.close();
  }
});

test("truncated diary is rejected without saving partial text", async () => {
  const app = fixture(async () => reply("length"));
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    await app.service.generate();
    const generation = app.service.getSnapshot().generation;
    assert.equal(generation.status, "error");
    assert.match(generation.error.message, /输出上限/);
    assert.equal(app.service.getSnapshot().data.entries.length, 0);
    assert.ok(!("text" in generation));
  } finally {
    app.close();
  }
});

test("diary owns the policy for an unexpected tool call and saves no entry", async () => {
  let requests = 0;
  const app = fixture(async () => {
    requests++;
    return new Response(
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call","function":{"name":"unregistered","arguments":"{}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n',
    );
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    await app.service.generate();
    const generation = app.service.getSnapshot().generation;
    assert.equal(generation.status, "error");
    assert.match(generation.error.message, /日记生成未注册工具.*unregistered/);
    assert.equal(app.service.getSnapshot().data.entries.length, 0);
    assert.equal(requests, 1);
  } finally {
    app.close();
  }
});

test("source revision keeps active generation while chat switching discards even a late complete reply", async () => {
  let start!: () => void;
  let finish!: (value: Response) => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const app = fixture(async () => {
    start();
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    const running = app.service.generate();
    await started;
    app.updateSource();
    assert.equal(app.service.getSnapshot().generation.status, "generating");
    await assert.rejects(
      app.service.saveSettings({ timeoutSeconds: 1, maxTokens: 100 }),
      /等待日记/,
    );
    app.switchChat();
    finish(reply());
    await running;
    assert.equal(app.service.getSnapshot().chatId, "phone-B");
    assert.equal(app.service.getSnapshot().data.entries.length, 0);
    assert.equal(app.saved.get("phone-A")!.entries.length, 0);
  } finally {
    app.close();
  }
});

test("failed save retains complete body and retries same diary without another model request", async () => {
  let calls = 0;
  const app = fixture(async () => {
    calls++;
    return reply();
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    app.failSave();
    await app.service.generate();
    const result = app.service.getSnapshot().generation;
    assert.equal(result.status, "save-error");
    assert.equal(result.entry.body, "今天的风让人安心。");
    const id = result.entry.id;
    app.restoreSave();
    await app.service.retrySave();
    assert.equal(calls, 1);
    assert.equal(app.saved.get("phone-A")!.entries[0]!.id, id);
    assert.equal(app.service.getSnapshot().generation.status, "complete");
  } finally {
    app.close();
  }
});

test("diary timeout aborts the Pi request with the configured total deadline", async () => {
  const transport = createStAiTransport(() => ({}), {
    fetchImpl: async (_, options) =>
      new Promise<Response>((_, reject) => {
        options!.signal!.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      }),
  });
  await assert.rejects(
    generateDiaryText({
      transport,
      connection,
      settings: { timeoutSeconds: 0.01, maxTokens: 10240 },
      prompt: "日记",
      signal: new AbortController().signal,
      onThinking: () => {},
    }),
    /超时/,
  );
});

test("ambiguous world state and cleaned-chat read failure stop before any model request", async () => {
  let requests = 0;
  const app = fixture(async () => {
    requests++;
    return reply();
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    app.db.exec("INSERT INTO phone_world_state SELECT * FROM phone_world_state");
    await app.service.generate();
    const invalidWorld = app.service.getSnapshot().generation;
    assert.equal(invalidWorld.status, "error");
    assert.match(invalidWorld.error.message, /恰好有一条/);
    assert.equal(requests, 0);
    app.db.exec(
      "DELETE FROM phone_world_state WHERE rowid=(SELECT max(rowid) FROM phone_world_state)",
    );
    app.data.readRecentChat = async () => {
      throw new Error("Memory 聊天接口读取失败");
    };
    await app.service.generate();
    const failedChat = app.service.getSnapshot().generation;
    assert.equal(failedChat.status, "error");
    assert.match(failedChat.error.message, /聊天接口读取失败/);
    assert.equal(requests, 0);
    assert.equal(app.service.getSnapshot().data.entries.length, 0);
  } finally {
    app.close();
  }
});

test("refreshing author choices preserves a failed save and its original error", async () => {
  const app = fixture();
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    app.failSave();
    await app.service.generate();
    const failed = app.service.getSnapshot().generation;
    assert.equal(failed.status, "save-error");
    await app.service.prepare();
    assert.equal(app.service.getSnapshot().generation, failed);
    assert.equal(failed.error.message, "磁盘失败");
    app.service.startWriting();
    assert.equal(app.service.getSnapshot().generation, failed);
    app.restoreSave();
    await app.service.retrySave();
    const completed = app.service.getSnapshot().generation;
    assert.equal(completed.status, "complete");
    assert.equal(completed.entry, failed.entry);
    app.service.startWriting();
    assert.equal(app.service.getSnapshot().generation.status, "idle");
    assert.equal(app.service.getSnapshot().data.entries.length, 1);
  } finally {
    app.close();
  }
});

test("generation uses fresh author material and rejects a removed author before requesting a model", async () => {
  const prompts: string[] = [];
  const app = fixture(async (_, options) => {
    prompts.push(options!.body as string);
    return reply();
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    app.db.exec("UPDATE phone_characters SET profile_text='刚刚更新的作者资料'");
    await app.service.generate();
    assert.match(prompts[0]!, /刚刚更新的作者资料/);
    app.db.exec("DELETE FROM phone_characters");
    await app.service.generate();
    const failed = app.service.getSnapshot().generation;
    assert.equal(failed.status, "error");
    assert.match(failed.error.message, /重新选择/);
    assert.equal(prompts.length, 1);
  } finally {
    app.close();
  }
});

test("a late author refresh cannot overwrite an active generation", async () => {
  let release!: () => void;
  let read!: () => void;
  const started = new Promise<void>((done) => {
    read = done;
  });
  const waiting = new Promise<void>((done) => {
    release = done;
  });
  const app = fixture();
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    const query = app.data.query;
    app.data.query = async (request) => {
      if (request.sql.includes("LIMIT 200 OFFSET")) {
        read();
        await waiting;
      }
      return query(request);
    };
    const refreshing = app.service.prepare();
    await started;
    await app.service.generate();
    const completed = app.service.getSnapshot().generation;
    assert.equal(completed.status, "complete");
    release();
    await refreshing;
    assert.equal(app.service.getSnapshot().generation, completed);
    assert.equal(app.service.getSnapshot().preparing, false);
  } finally {
    app.close();
  }
});

test("retrying a save supersedes an unfinished refresh without leaving the page busy", async () => {
  let release!: () => void;
  let read!: () => void;
  const started = new Promise<void>((done) => {
    read = done;
  });
  const waiting = new Promise<void>((done) => {
    release = done;
  });
  const app = fixture();
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    app.failSave();
    await app.service.generate();
    const query = app.data.query;
    app.data.query = async (request) => {
      if (request.sql.includes("LIMIT 200 OFFSET")) {
        read();
        await waiting;
      }
      return query(request);
    };
    const refreshing = app.service.prepare();
    await started;
    app.restoreSave();
    await app.service.retrySave();
    assert.equal(app.service.getSnapshot().generation.status, "complete");
    assert.equal(app.service.getSnapshot().preparing, false);
    release();
    await refreshing;
    assert.equal(app.service.getSnapshot().generation.status, "complete");
    assert.equal(app.saved.get("phone-A")!.entries.length, 1);
  } finally {
    app.close();
  }
});

test("persisted diary author survives changed instance IDs and keeps current chronicle relations", async () => {
  const requests: Record<string, unknown>[] = [];
  const app = fixture(async (_, options) => {
    requests.push(JSON.parse(options!.body as string));
    return reply();
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    const oldAuthor = structuredClone(app.saved.get("phone-A")!.author);
    app.importScope();
    await app.service.generate();
    assert.equal(app.service.getSnapshot().generation.status, "complete");
    const messages = requests[0]!.messages as { role: string; content: string }[];
    const prompt = JSON.parse(messages.find((message) => message.role === "user")!.content);
    assert.deepEqual(
      prompt.最近纪要.map((entry: { 标题: string }) => entry.标题),
      ["纪要22", "纪要23", "纪要24", "纪要25", "纪要26"],
    );
    assert.deepEqual(app.saved.get("phone-A")!.author, oldAuthor);
    assert.equal(app.saved.get("phone-A")!.entries[0]!.author.id, "author");
    assert.equal(app.saved.get("phone-A")!.entries[0]!.author.scopeId, "scope");
  } finally {
    app.close();
  }
});

test("same names and stable record IDs in a different stable scope reject an old author", async () => {
  let requests = 0;
  const app = fixture(async () => {
    requests++;
    return reply();
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    app.importScope("different-origin");
    await app.service.generate();
    const state = app.service.getSnapshot().generation;
    assert.equal(state.status, "error");
    assert.match(state.error.message, /原日记作者/);
    assert.equal(requests, 0);
    assert.equal(app.saved.get("phone-A")!.entries.length, 0);
  } finally {
    app.close();
  }
});

test("rebuilding a stable space during generation rejects its old author even with the same instance scope", async () => {
  let finish!: (response: Response) => void;
  let start!: () => void;
  const started = new Promise<void>((done) => {
    start = done;
  });
  const app = fixture(async () => {
    start();
    return new Promise<Response>((done) => {
      finish = done;
    });
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    const running = app.service.generate();
    await started;
    app.rebuildScope();
    finish(reply());
    await running;
    const generation = app.service.getSnapshot().generation;
    assert.equal(generation.status, "error");
    assert.match(generation.error.message, /稳定资料空间已变化/);
    assert.equal(app.saved.get("phone-A")!.entries.length, 0);
  } finally {
    app.close();
  }
});

const image: ImageRecord & { source: "hub" } = {
  source: "hub",
  id: "image-1",
  imagePath: "/images/1.png",
  prompt: "海边",
  startedAt: "2026-01-01T00:00:00Z",
  savedAt: "2026-01-01T00:00:01Z",
};

test("automatic images start after text persistence, associate only the first image, and retry after a text save failure", async () => {
  let calls = 0;
  const app = fixture(undefined, {
    listImages: async () => [],
    generate: async ({ prompt }) => {
      calls++;
      const saved = app.saved.get("phone-A")!.entries[0]!;
      assert.equal(saved.body, "今天的风让人安心。");
      assert.equal(saved.imagePrompt, prompt);
      return [image, { ...image, id: "image-2" }];
    },
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    await app.service.saveSettings({
      timeoutSeconds: 300,
      maxTokens: 10240,
      autoGenerateImage: true,
    });
    app.failSave();
    await app.service.generate();
    assert.equal(calls, 0);
    assert.equal(app.service.getSnapshot().generation.status, "save-error");
    app.restoreSave();
    await app.service.retrySave();
    assert.equal(calls, 1);
    assert.deepEqual(app.saved.get("phone-A")!.entries[0]!.image, {
      id: image.id,
      imagePath: image.imagePath,
      source: "hub",
    });
  } finally {
    app.close();
  }
});

test("image failures preserve saved text and prompts, and association failure directs the user to the gallery", async () => {
  let failHub = true;
  const app = fixture(undefined, {
    listImages: async () => [],
    generate: async () => {
      if (failHub) {
        throw new Error("生图失败");
      }
      return [image];
    },
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    await app.service.generate();
    const entry = app.saved.get("phone-A")!.entries[0]!;
    await assert.rejects(app.service.generateImage(entry.id), /生图失败/);
    assert.equal(app.saved.get("phone-A")!.entries[0]!.imagePrompt, entry.imagePrompt);
    failHub = false;
    app.failSave();
    await assert.rejects(app.service.generateImage(entry.id), /已存入图库/);
    assert.equal(app.saved.get("phone-A")!.entries[0]!.image, undefined);
    app.restoreSave();
    await app.service.selectImage(entry.id, image);
    assert.equal(app.saved.get("phone-A")!.entries[0]!.image!.id, image.id);
  } finally {
    app.close();
  }
});

test("removing an image keeps its prompt and blocks other writes while the task runs", async () => {
  const app = fixture(undefined, {
    listImages: async () => [],
    generate: async () => [image],
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    await app.service.generate();
    const entry = app.saved.get("phone-A")!.entries[0]!;
    await app.service.selectImage(entry.id, image);

    const removing = app.service.removeImage(entry.id);
    await assert.rejects(app.service.deleteEntry(entry.id), /等待/);
    await removing;

    const saved = app.saved.get("phone-A")!.entries[0]!;
    assert.equal(saved.image, undefined);
    assert.equal(saved.imagePrompt, entry.imagePrompt);
    assert.equal(app.service.getSnapshot().imageTask.status, "idle");
  } finally {
    app.close();
  }
});

test("quitting ignores late Hub association while the Hub request continues", async () => {
  let finish!: (images: readonly ImageRecord[]) => void;
  const app = fixture(undefined, {
    listImages: async () => [],
    generate: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    await app.service.generate();
    const entry = app.saved.get("phone-A")!.entries[0]!;
    const running = app.service.generateImage(entry.id);
    await assert.rejects(app.service.deleteEntry(entry.id), /等待/);
    app.service.quit();
    finish([image]);
    await running;
    assert.equal(app.saved.get("phone-A")!.entries[0]!.image, undefined);
    assert.equal(app.service.getSnapshot().imageTask.status, "idle");
  } finally {
    app.close();
  }
});

test("invalid image prompt fails the whole text result before saving", async () => {
  const app = fixture(
    async () => new Response(event(JSON.stringify({ body: "已生成正文" })) + end()),
  );
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    await app.service.generate();
    assert.equal(app.service.getSnapshot().generation.status, "error");
    assert.equal(app.saved.get("phone-A")!.entries.length, 0);
  } finally {
    app.close();
  }
});

test("image prompt extraction uses only saved author and text without reading live background", async () => {
  let extract = false;
  let request = "";
  const app = fixture(async (_, init) => {
    request = init!.body as string;
    return extract
      ? new Response(event(JSON.stringify({ imagePrompt: "从旧日记提炼的海边晚风" })) + end())
      : reply();
  });
  try {
    await app.service.prepare();
    await app.service.selectAuthor("author");
    await app.service.generate();
    const entry = app.saved.get("phone-A")!.entries[0]!;
    extract = true;
    app.data.query = async () => {
      throw new Error("不能读取当前背景");
    };
    await app.service.createImagePrompt(entry.id);
    assert.match(request, /今天的风让人安心/);
    assert.doesNotMatch(request, /远处有人等车/);
    assert.equal(app.saved.get("phone-A")!.entries[0]!.imagePrompt, "从旧日记提炼的海边晚风");
  } finally {
    app.close();
  }
});
