import { momentImagePromptInput } from "./wechat-moments-image-prompt.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { parseGeneratedInteraction, parseGeneratedMoment } from "./wechat-moments-output.ts";
import {
  momentInteractionWindow,
  momentSystemPrompt,
  readMomentPrompt,
  type MomentGenerationInput,
} from "./wechat-moments-prompt.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type { WechatMoment } from "./wechat-moments.ts";
import { generateMomentOutput } from "./wechat-moments-generation.ts";
import { createStAiTransport } from "../../infrastructure/host/ai-transport.ts";
import { previewMomentOutput } from "../../../docs/ui/preview-wechat-moments-ai.ts";

const author = { id: "a", scopeId: "stable", name: "甲" };
const moment: WechatMoment = {
  id: "post",
  author,
  text: "完整动态",
  media: { type: "video", description: "视频描述" },
  createdAt: "2026-11-03T00:00:00.000Z",
  comments: Array.from({ length: 55 }, (_, index) => ({
    id: `c${index}`,
    author,
    text: `评论${index}`,
    createdAt: "2026-11-03T00:00:00.000Z",
    ...(index === 54
      ? { replyTo: { commentId: "c3", author } }
      : index === 3
        ? { replyTo: { commentId: "c0", author } }
        : {}),
  })),
};

test("AI动态严格校验身份/字段/内容，空动态、混合媒体与非法JSON整次失败", () => {
  assert.deepEqual(
    parseGeneratedMoment(
      JSON.stringify({
        authorId: "a",
        text: " ",
        media: {
          type: "images",
          items: [" 图 "].map((description) => ({ description, prompt: description.trim() })),
        },
      }),
      "a",
    ),
    {
      text: "",
      media: {
        type: "images",
        items: ["图"].map((description) => ({ description, prompt: description.trim() })),
      },
    },
  );
  for (const value of [
    { authorId: "other", text: "分享", media: { type: "none" } },
    { authorId: "a", text: "", media: { type: "none" } },
    {
      authorId: "a",
      text: "分享",
      media: {
        type: "images",
        items: ["图"].map((description) => ({ description, prompt: description.trim() })),
        description: "视频",
      },
    },
    { authorId: "a", text: "分享", media: { type: "video", description: "" } },
    { authorId: "a", text: "分享", media: { type: "audio" } },
    { authorId: "a", text: "分享", media: { type: "none" }, extra: "额外" },
  ]) {
    assert.throws(() => parseGeneratedMoment(JSON.stringify(value), "a"));
  }
  assert.throws(() => parseGeneratedMoment("```json\n{}\n```", "a"));
});

test("AI互动允许空批和已有/批前序引用，拒绝未来项、被排除帐号和非法引用", () => {
  const allowed = new Set(["b"]);
  const existing = new Set(["c54", "c3"]);
  const first = { authorId: "b", text: " 回复 ", replyTo: { type: "existing", commentId: "c3" } };
  const second = { authorId: "b", text: "跟进", replyTo: { type: "batch", index: 0 } };
  assert.deepEqual(parseGeneratedInteraction('{"comments":[]}', allowed, existing), []);
  assert.equal(
    parseGeneratedInteraction(JSON.stringify({ comments: [first, second] }), allowed, existing)[0]!
      .text,
    "回复",
  );
  for (const comments of [
    [first, { ...second, replyTo: { type: "batch", index: 1 } }],
    [{ ...first, replyTo: { type: "batch", index: 0 } }],
    [{ ...first, replyTo: { type: "batch", index: -1 } }],
    [{ ...first, replyTo: { type: "batch", index: 0.5 } }],
    [first, { ...second, authorId: "a" }],
    [first, { ...second, text: " " }],
    [{ ...first, replyTo: { type: "existing", commentId: "deleted" } }],
    [{ ...first, replyTo: { type: "existing", commentId: "c0" } }],
    Array(6).fill(first),
  ]) {
    assert.throws(() => parseGeneratedInteraction(JSON.stringify({ comments }), allowed, existing));
  }
});

test("互动最近50条仅补直接目标，删除目标保留事实且不递归追链", () => {
  const selected = momentInteractionWindow(moment);
  assert.equal(selected.comments.length, 50);
  assert.equal(selected.comments[0]!.id, "c5");
  assert.deepEqual(
    selected.directTargets.map((item) => item.id),
    ["c3"],
  );
  const deleted = { ...moment, comments: moment.comments.filter((item) => item.id !== "c3") };
  const window = momentInteractionWindow(deleted);
  assert.deepEqual(window.directTargets, []);
  assert.equal(window.comments.at(-1)!.replyTo!.commentId, "c3");
  assert.equal(JSON.parse(JSON.stringify(window)).comments.at(-1).replyTargetDeleted, true);
});

test("朋友圈分别取单人关联与多人公开资料，固定历史窗口并隔离单聊", async () => {
  const reads: string[] = [];
  const data = {
    readSummary: async () => {
      reads.push("summary");
      return "全部summary";
    },
    readWorldState: async () => {
      reads.push("world");
      return [{ worldTime: "剧情日期", location: "地点", weather: "天气" }];
    },
    readRecentChat: async (request: { count: number }) => {
      assert.equal(request.count, 10);
      reads.push("recent");
      return { messages: [{ content: "清洗ST" }] };
    },
    readRelatedBackground: async (request: { participantIds: readonly string[] }) => {
      assert.deepEqual(request.participantIds, ["a"]);
      reads.push("related");
      return { relationships: ["关联背景"] };
    },
  } as unknown as DataAppPublic;
  const common = {
    scope: { chatIdentity: "chat", scopeId: "instance" },
    scopeId: "stable",
    guidance: { a: "甲的公开表达", b: "乙的公开表达" },
  };
  const postInput: MomentGenerationInput = {
    ...common,
    kind: "post",
    author: { id: "a", name: "甲", profileText: "完整甲资料" },
    history: Array.from({ length: 12 }, (_, index) => ({ ...moment, id: `p${index}` })),
  };
  const post = JSON.parse(await readMomentPrompt(data, postInput));
  assert.equal(post.history.length, 10);
  assert.equal(post.history[0].id, "p2");
  assert.equal(post.history[0].comments, undefined);
  assert.equal(post.author.profileText, "完整甲资料");
  assert.match(momentSystemPrompt(postInput), /甲的公开表达/);
  assert.doesNotMatch(momentSystemPrompt(postInput), /乙的公开表达/);
  reads.length = 0;
  const input: MomentGenerationInput = {
    ...common,
    kind: "interaction",
    requiredAuthorIds: [],
    account: { id: "a", name: "甲", profileText: "完整甲资料" },
    candidates: [{ id: "b", name: "乙", profileText: "完整乙资料" }],
    moment,
  };
  const interaction = JSON.parse(await readMomentPrompt(data, input));
  assert.deepEqual(reads.sort(), ["recent", "summary", "world"]);
  assert.equal(interaction.comments.length, 50);
  assert.equal(interaction.directTargets.length, 1);
  assert.equal(interaction.moment.media.description, "视频描述");
  assert.equal(interaction.account.profileText, "完整甲资料");
  assert.equal(interaction.candidates[0].profileText, "完整乙资料");
  assert.match(momentSystemPrompt(input), /甲的公开表达/);
  assert.match(momentSystemPrompt(input), /乙的公开表达/);
  assert.equal("conversations" in interaction, false);
  assert.equal(interaction.participationMode, "auto");
  assert.deepEqual(interaction.requiredAuthorIds, []);
  const selected = {
    ...input,
    requiredAuthorIds: ["b"],
    guidance: { ...input.guidance, c: "未选择人物指导" },
  };
  const selectedMaterial = JSON.parse(await readMomentPrompt(data, selected));
  assert.equal(selectedMaterial.participationMode, "selected");
  assert.deepEqual(selectedMaterial.requiredAuthorIds, ["b"]);
  assert.match(momentSystemPrompt(selected), /每位必选人物至少生成一条/);
  assert.doesNotMatch(momentSystemPrompt(selected), /未选择人物指导/);
});

test("指定互动人物必须全部发言，空批或漏人整批失败，允许同一人多条回复", () => {
  const authors = new Set(["b", "c"]);
  const comment = (authorId: string) => ({ authorId, text: "回应", replyTo: null });
  assert.throws(
    () => parseGeneratedInteraction('{"comments":[]}', authors, new Set(), ["b"]),
    /遗漏/,
  );
  assert.throws(
    () =>
      parseGeneratedInteraction(
        JSON.stringify({ comments: [comment("b"), comment("b")] }),
        authors,
        new Set(),
        ["b", "c"],
      ),
    /遗漏/,
  );
  const output = JSON.stringify({
    comments: [
      comment("c"),
      comment("b"),
      { ...comment("b"), replyTo: { type: "batch", index: 0 } },
    ],
  });
  assert.equal(parseGeneratedInteraction(output, authors, new Set(), ["b", "c"]).length, 3);
  assert.throws(
    () => parseGeneratedInteraction(output, new Set(["b"]), new Set(), ["b"]),
    /不允许/,
  );
});

test("预览互动按全部必选名单生成并保留已有及批内回复，空模式暴露漏人错误", () => {
  for (const requiredAuthorIds of [["b"], ["b", "c"], ["b", "c", "d", "e", "f"]]) {
    const input = {
      requiredAuthorIds,
      candidates: requiredAuthorIds.map((id) => ({ id })),
      comments: [{ id: "existing" }],
    };
    const messages = [{ content: JSON.stringify(input) }];
    const result = parseGeneratedInteraction(
      previewMomentOutput(messages, null),
      new Set(requiredAuthorIds),
      new Set(["existing"]),
      requiredAuthorIds,
    );
    assert.deepEqual(
      new Set(result.map((comment) => comment.authorId)),
      new Set(requiredAuthorIds),
    );
    assert.ok(result.length <= 5);
    assert.deepEqual(result[0]!.replyTo, { type: "existing", commentId: "existing" });
    assert.deepEqual(result[1]!.replyTo, { type: "batch", index: 0 });
    assert.throws(
      () =>
        parseGeneratedInteraction(
          previewMomentOutput(messages, "empty"),
          new Set(requiredAuthorIds),
          new Set(["existing"]),
          requiredAuthorIds,
        ),
      /遗漏/,
    );
  }
});

test("朋友圈拒绝意外工具调用且不发起后续模型调用", async () => {
  let calls = 0;
  const transport = createStAiTransport(() => ({}), {
    fetchImpl: async () => {
      ++calls;
      const chunks = [
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "forbidden-call",
                    type: "function",
                    function: { name: "forbidden", arguments: "{}" },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
      ];
      return new Response(
        `${chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`,
      );
    },
  });
  await assert.rejects(
    generateMomentOutput({
      transport,
      connection: {
        id: "test",
        name: "test",
        model: "model",
        baseUrl: "http://model/v1",
        apiKey: "",
        customHeaders: {},
      },
      systemPrompt: "朋友圈",
      prompt: "生成",
      operation: "朋友圈发布",
      signal: new AbortController().signal,
    }),
    /未注册工具/,
  );
  assert.equal(calls, 1);
});

test("朋友圈提示词只包含媒体文字，过滤图库路径与data URL", async () => {
  const privateImage = {
    ...moment,
    media: {
      type: "images" as const,
      items: [
        {
          description: "甲在窗边",
          prompt: "甲的侧面近景",
          image: { id: "secret", imagePath: "data:image/png;base64,PRIVATE" },
        },
      ],
    },
  };
  const data = {
    readSummary: async () => "",
    readWorldState: async () => "",
    readRecentChat: async () => [],
    readRelatedBackground: async () => null,
  } as unknown as DataAppPublic;
  const result = await readMomentPrompt(data, {
    kind: "interaction",
    scope: {} as MomentGenerationInput["scope"],
    scopeId: "stable",
    guidance: {},
    account: { id: "a", name: "甲", profileText: "" },
    candidates: [{ id: "b", name: "乙", profileText: "" }],
    requiredAuthorIds: [],
    moment: privateImage,
  });
  assert.ok(result.includes("甲在窗边"));
  assert.ok(!result.includes("PRIVATE"));
  assert.ok(!result.includes("imagePath"));
});

test("旧动态完善Prompt只提供作者及明确点名人物，AI新图必须返回完整Prompt字段", () => {
  const input = JSON.parse(
    momentImagePromptInput(moment, { description: "我和乙站在窗边", prompt: "第三人称近景" }, [
      { id: "a", name: "甲", profileText: "短发" },
      { id: "b", name: "乙", profileText: "蓝色外套" },
      { id: "c", name: "丙", profileText: "不相关的秘密" },
    ]),
  );
  assert.deepEqual(
    input.characters.map((person: { id: string }) => person.id),
    ["a", "b"],
  );
  assert.ok(!JSON.stringify(input).includes("不相关的秘密"));
  for (const items of [
    [{ description: "图" }],
    [{ description: "图", prompt: " " }],
    [{ description: "图", prompt: "内容", image: { id: "x", imagePath: "x" } }],
  ]) {
    assert.throws(() =>
      parseGeneratedMoment(
        JSON.stringify({ authorId: "a", text: "", media: { type: "images", items } }),
        "a",
      ),
    );
  }
});
