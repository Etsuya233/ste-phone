import assert from "node:assert/strict";
import test from "node:test";
import { applyCampusCommand } from "./campus-commands.ts";
import {
  createCampusPost,
  emptyCampus,
  type CampusAccount,
  type CampusData,
} from "./campus-domain.ts";
import { readCampusData } from "./campus-records.ts";

const account = (id: string): CampusAccount => ({
  id,
  nickname: id,
  owner: { kind: "memory", id: "red" },
  avatar: "",
  bio: "",
  style: "",
  privateIdentity: id === "alt",
  disabled: false,
  following: [],
});

const setup = (): CampusData => {
  const post = createCampusPost({
    id: "post",
    authorId: "main",
    text: "读书会",
    images: [],
    backgroundLikes: 1234,
    backgroundComments: 1056,
  });
  return {
    ...emptyCampus(),
    accounts: [account("main"), account("alt")],
    posts: [{ ...post, backgroundLikes: 1200, backgroundComments: 1000 }],
    activeAccountId: "main",
  };
};

test("新帖原样保留指定背景数量，实际点赞独立累加且旧帖保持原值", () => {
  const input = { id: "new", authorId: "main", text: "日常分享", images: [] };
  const ordinary = createCampusPost({ ...input, backgroundLikes: 0, backgroundComments: 0 });
  assert.equal(ordinary.backgroundLikes, 0);
  assert.equal(ordinary.backgroundComments, 0);
  const data = { ...setup(), posts: [ordinary] };
  const liked = applyCampusCommand(data, { type: "like", postId: "new" });
  assert.deepEqual(liked.posts[0]!.likes, ["main"]);
  assert.equal(liked.posts[0]!.backgroundLikes, 0);
  const news = createCampusPost({ ...input, backgroundLikes: 537, backgroundComments: 82 });
  assert.equal(news.backgroundLikes, 537);
  assert.equal(news.backgroundComments, 82);
  const legacy = { ...data, posts: [{ ...ordinary, backgroundLikes: 25, backgroundComments: 4 }] };
  assert.deepEqual(readCampusData(legacy), legacy);
});

test("旧 Twitter 配图升级保留 Hub 路径，只有地址的头像保持原样", () => {
  const data = setup();
  const legacy = {
    people: data.people,
    activeAccountId: data.activeAccountId,
    appliedBatches: data.appliedBatches,
    accounts: [{ ...data.accounts[0]!, avatar: "/avatar.png" }, data.accounts[1]!],
    posts: [
      {
        ...data.posts[0]!,
        images: [{ description: "窗外", image: { id: "hub", path: "/old.png" } }],
      },
    ],
  };
  const result = readCampusData(legacy);
  assert.equal(result.version, 2);
  assert.equal(result.accounts[0]!.avatar, "/avatar.png");
  assert.deepEqual(result.posts[0]!.images[0]!.image, {
    source: "hub",
    id: "hub",
    imagePath: "/old.png",
  });
  assert.equal(legacy.posts[0]!.images[0]!.image.path, "/old.png");
});

test("同一人物的主号和小号各自关注和点赞，取消不改变背景点赞", () => {
  let data = setup();
  data = applyCampusCommand(data, { type: "follow", accountId: "alt" });
  data = applyCampusCommand(data, { type: "like", postId: "post" });
  data = applyCampusCommand({ ...data, activeAccountId: "alt" }, { type: "like", postId: "post" });
  assert.deepEqual(
    data.accounts.map(({ following }) => following),
    [["alt"], []],
  );
  assert.deepEqual(data.posts[0]!.likes, ["main", "alt"]);
  data = applyCampusCommand(data, { type: "like", postId: "post" });
  assert.deepEqual(data.posts[0]!.likes, ["main"]);
  assert.equal(data.posts[0]!.backgroundLikes, 1200);
});

test("删除已有楼内回复的评论保留回复及稳定目标", () => {
  let data = setup();
  const add = (id: string, replyTo: string | null) => {
    data = applyCampusCommand(data, {
      type: "comment",
      postId: "post",
      comment: { id, authorId: "alt", text: "留言", replyTo, deleted: false },
    });
  };
  add("first", null);
  data = { ...data, activeAccountId: "alt" };
  add("second", "first");
  assert.throws(
    () => applyCampusCommand(data, { type: "delete-comment", postId: "post", commentId: "first" }),
    /当前账号/,
  );
  data = applyCampusCommand(
    { ...data, activeAccountId: "main" },
    { type: "delete-comment", postId: "post", commentId: "first" },
  );
  const post = readCampusData(data).posts[0]!;
  assert.equal(post.comments[0]!.deleted, true);
  assert.equal(post.comments[0]!.text, "");
  assert.equal(typeof post.comments[0]!.createdAt, "number");
  assert.equal(post.comments[1]!.replyTo, "first");
  assert.equal(post.comments.filter(({ deleted }) => !deleted).length, 1);
  assert.equal(post.backgroundComments, 1000);
  assert.throws(() => add("third", "first"), /回复目标已删除/);
});

test("存储读取拒绝无效引用、重复身份、不安全背景计数及回复循环", () => {
  const invalid = [
    { authorId: "unknown" },
    { likes: ["alt", "alt"] },
    { backgroundComments: Number.MAX_SAFE_INTEGER + 1 },
    { comments: [{ id: "c", authorId: "main", text: "留言", replyTo: "c", deleted: false }] },
  ];
  for (const fields of invalid) {
    const data = setup();
    assert.throws(
      () => readCampusData({ ...data, posts: [{ ...data.posts[0], ...fields }] }),
      /存储格式无效/,
    );
  }
  const data = setup();
  assert.throws(
    () => readCampusData({ ...data, accounts: [...data.accounts, account("alt")] }),
    /账号 ID/,
  );
});
