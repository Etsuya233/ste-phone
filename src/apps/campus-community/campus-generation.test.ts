import assert from "node:assert/strict";
import test from "node:test";
import type { DataAppPublic } from "../data-source/public.ts";
import {
  createCampusPost,
  emptyCampus,
  type CampusAccount,
  type CampusGenerationRequest,
} from "./campus-domain.ts";
import { parseCampusBatch } from "./campus-output.ts";
import { readCampusPrompt, type CampusPromptTarget } from "./campus-prompt.ts";

const newcomer = {
  key: "new:1",
  nickname: "路过的阿雾",
  bio: "摄影社",
  style: "话短",
  profile: "大一",
};

test("指定账号是候选范围，当前账号可发帖，越界作者与新路人使整批失败", () => {
  const post = {
    authorId: "active",
    text: "",
    images: [{ description: "夜景", prompt: "校园灯光" }],
    backgroundLikes: 0,
    backgroundComments: 0,
  };
  const parse = (people: unknown[], posts: unknown[]) =>
    parseCampusBatch(
      JSON.stringify({ people, posts }),
      "batch",
      ["active", "other"],
      undefined,
      false,
    );
  const batch = parse([], [post]);
  assert.deepEqual(batch.posts[0]?.images, post.images);
  assert.equal(batch.posts[0]?.authorId, "active");
  assert.throws(() => parse([], [post, { ...post, authorId: "outsider" }]), /候选范围/);
  assert.throws(() => parse([newcomer], [post]), /最多 0 项/);
  assert.throws(() => parse([], [{ ...post, images: [] }]), /不能全部为空/);
});

test("模型背景数量原样保存，缺失、非法数字及旧热门标记整批拒绝", () => {
  const post = {
    authorId: "active",
    text: "新闻",
    images: [],
    backgroundLikes: 3721,
    backgroundComments: 218,
  };
  const parse = (posts: unknown[]) =>
    parseCampusBatch(JSON.stringify({ people: [], posts }), "batch", ["active"], undefined, false);
  const batch = parse([post, { ...post, backgroundLikes: 0, backgroundComments: 0 }]);
  assert.deepEqual(
    batch.posts.map(({ backgroundLikes, backgroundComments }) => [
      backgroundLikes,
      backgroundComments,
    ]),
    [
      [3721, 218],
      [0, 0],
    ],
  );
  for (const field of ["backgroundLikes", "backgroundComments"]) {
    for (const value of [-1, 1.5, "20", null, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => parse([post, { ...post, [field]: value }]), /非负安全整数/);
    }
    assert.throws(() => parse([{ ...post, [field]: undefined }]), /字段无效/);
  }
  assert.throws(
    () => parse([{ authorId: "active", text: "旧协议", images: [], popular: true }]),
    /字段无效/,
  );
});

test("自动互动保留路人和批内回复，拒绝已删除、异帖及未来回复目标", () => {
  const target: CampusPromptTarget = {
    id: "post",
    authorId: "active",
    text: "正文",
    images: [],
    createdAt: 0,
    actualCommentCount: 1,
    likes: [],
    comments: [
      { id: "existing", authorId: "active", text: "留言", replyTo: null, deleted: false },
      { id: "deleted", authorId: "active", replyTo: null, deleted: true },
    ],
  };
  const first = { authorId: "new:1", text: "照片很好看", replyTo: { commentId: "existing" } };
  const second = { authorId: "active", text: "谢谢", replyTo: { batchIndex: 0 } };
  const parse = (comments: unknown[], likes = ["active", "active"]) =>
    parseCampusBatch(
      JSON.stringify({ people: [newcomer], likes, comments }),
      "batch",
      ["active"],
      target,
      true,
    );
  const batch = parse([first, second]);
  assert.equal(batch.accounts[0]?.nickname, newcomer.nickname);
  assert.equal(batch.people[0]?.profile, newcomer.profile);
  assert.equal(batch.interaction?.comments[0]?.authorId, batch.accounts[0]?.id);
  assert.equal(batch.interaction?.comments[1]?.replyTo, batch.interaction?.comments[0]?.id);
  assert.deepEqual(batch.interaction?.likes, ["active"]);
  assert.throws(() => parse([first, { ...second, replyTo: { batchIndex: 1 } }]), /前序评论/);
  assert.throws(() => parse([{ ...first, replyTo: { commentId: "deleted" } }]), /未提供或已删除/);
  assert.throws(
    () => parse([{ ...first, replyTo: { commentId: "another-post" } }]),
    /未提供或已删除/,
  );
  assert.throws(() => parse([first], ["outsider"]), /候选范围/);
  assert.throws(() => parse([]), /未参与本批/);
});

test("取材只公开账号资料，私有小号档案只附于本账号，并保留近期回复的直接目标", async () => {
  const privateOwnerId = "private-owner-id";
  const privateProfile = "小号写作时可以参考的剧情资料";
  const profile: CampusAccount = {
    id: "alt",
    owner: { kind: "memory", id: privateOwnerId },
    nickname: "小号",
    avatar: "/path",
    bio: "公开简介",
    style: "私用语气",
    disabled: false,
    following: [],
    privateIdentity: true,
  };
  const request: CampusGenerationRequest = {
    id: "batch",
    scope: { chatIdentity: "chat", scopeId: "instance" },
    accountIds: ["alt"],
    instruction: "",
    postId: "post",
    data: {
      ...emptyCampus(),
      accounts: [profile],
      activeAccountId: "alt",
      posts: [
        {
          ...createCampusPost({
            id: "post",
            authorId: "alt",
            text: "",
            images: [
              {
                description: "照片",
                image: { source: "hub", id: "image", imagePath: "private-image-path" },
              },
            ],
            backgroundLikes: 0,
            backgroundComments: 0,
          }),
          comments: Array.from({ length: 52 }, (_, index) => ({
            id: String(index),
            authorId: "alt",
            text: index === 0 ? "deleted-body" : "评论",
            replyTo: index === 51 ? "0" : null,
            deleted: index === 0,
          })),
        },
      ],
    },
  };
  const source = {
    readBackground: async () => ({
      characters: [{ id: privateOwnerId, profileText: privateProfile }],
    }),
    readSummary: async () => "",
    readWorldState: async () => [],
    readRecentChat: async () => [],
    readRelatedBackground: async () => {
      throw new Error("小号归属不进入公开背景查询");
    },
  } as unknown as DataAppPublic;
  const context = await readCampusPrompt(source, request);
  assert.deepEqual(context.publicAccounts, [{ id: "alt", nickname: "小号", bio: "公开简介" }]);
  assert.equal(context.accounts[0]?.privateWritingProfile, privateProfile);
  assert.equal(context.targetPost?.comments.length, 51);
  assert.deepEqual(context.targetPost?.comments[0], {
    id: "0",
    authorId: "alt",
    replyTo: null,
    deleted: true,
  });
  const prompt = JSON.stringify(context);
  for (const secret of [privateOwnerId, "private-image-path", "deleted-body"]) {
    assert.equal(prompt.includes(secret), false);
  }
});

test("长讨论补齐跨窗口祖先链，保留删除锚点并按原顺序排除无关旧评论", async () => {
  const post = createCampusPost({
    id: "post",
    authorId: "notice",
    text: "朗读会讨论",
    images: [],
    backgroundLikes: 0,
    backgroundComments: 0,
  });
  post.comments = Array.from({ length: 56 }, (_, index) => ({
    id: `c${index}`,
    authorId: "notice",
    text: index === 0 ? "朗读会周五下午在图书馆举行。" : `评论 ${index}`,
    replyTo: null as string | null,
    deleted: index === 2,
  }));
  post.comments[1]!.replyTo = "c0";
  post.comments[2]!.replyTo = "c1";
  post.comments[54]!.replyTo = "c2";
  post.comments[55]!.replyTo = "c54";
  const request: CampusGenerationRequest = {
    id: "batch",
    scope: { chatIdentity: "chat", scopeId: "instance" },
    accountIds: [],
    instruction: "",
    postId: post.id,
    data: { ...emptyCampus(), posts: [post] },
  };
  const source = {
    readBackground: async () => ({ characters: [] }),
    readSummary: async () => "",
    readWorldState: async () => [],
    readRecentChat: async () => [],
  } as unknown as DataAppPublic;

  const context = await readCampusPrompt(source, request);
  const comments = context.targetPost!.comments;
  assert.deepEqual(
    comments.map(({ id }) => id),
    ["c0", "c1", "c2", ...post.comments.slice(6).map(({ id }) => id)],
  );
  assert.equal(comments[0]!.text, "朗读会周五下午在图书馆举行。");
  assert.deepEqual(comments[2], {
    id: "c2",
    authorId: "notice",
    replyTo: "c1",
    deleted: true,
  });
  assert.equal(context.targetPost!.actualCommentCount, 55);
});
