import {
  CAMPUS_MAX_IMAGES,
  createCampusPost,
  type CampusAccount,
  type CampusBatch,
  type CampusComment,
  type CampusPerson,
} from "./campus-domain.ts";
import { campusWindow, type CampusPromptTarget } from "./campus-prompt.ts";

function fields(value: unknown, names: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Twitter模型输出应为 JSON 对象");
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).length !== names.length ||
    names.some((name) => !Object.hasOwn(record, name))
  ) {
    throw new Error("Twitter模型输出字段无效");
  }
  return record;
}

function list(value: unknown, max: number, label: string): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error(`Twitter${label}应为数组，最多 ${max} 项`);
  }
  return value;
}

function string(value: unknown, label: string, empty = false): string {
  if (typeof value !== "string" || (!empty && !value.trim())) {
    throw new Error(`Twitter${label}无效`);
  }
  return value.trim();
}

function parsePeople(raw: unknown, batchId: string, allowed: Set<string>, automatic: boolean) {
  const people: CampusPerson[] = [];
  const accounts: CampusAccount[] = [];
  const newAccountIds = new Map<string, string>();
  const proposed = list(raw, automatic ? campusWindow.newPeople : 0, "新路人");
  proposed.forEach((entry, index) => {
    const { key, nickname, bio, style, profile } = fields(entry, [
      "key",
      "nickname",
      "bio",
      "style",
      "profile",
    ]);
    if (
      typeof key !== "string" ||
      !/^new:[1-9]\d*$/.test(key) ||
      allowed.has(key) ||
      newAccountIds.has(key)
    ) {
      throw new Error("Twitter新路人的引用无效或重复");
    }
    const personId = `${batchId}:person:${index}`;
    const id = `${batchId}:account:${index}`;
    newAccountIds.set(key, id);
    people.push({ id: personId, profile: string(profile, "路人人设"), disabled: false });
    accounts.push({
      id,
      owner: { kind: "person", id: personId },
      nickname: string(nickname, "路人昵称"),
      bio: string(bio, "公开简介", true),
      style: string(style, "发言风格", true),
      avatar: "",
      disabled: false,
      privateIdentity: false,
      following: [],
    });
  });
  return { accounts, people, newAccountIds };
}

function parsePosts(raw: unknown, batchId: string, author: (value: unknown) => string) {
  const proposed = list(raw, campusWindow.postsPerBatch, "生成帖子");
  if (!proposed.length) {
    throw new Error("Twitter模型未返回帖子");
  }
  return proposed.map((entry, index) => {
    const post = fields(entry, ["authorId", "text", "images", "popular"]);
    if (typeof post.popular !== "boolean") {
      throw new Error("Twitter热度类型无效");
    }
    const text = string(post.text, "帖子正文", true);
    const images = list(post.images, CAMPUS_MAX_IMAGES, "帖子图片").map((entry) => {
      const image = fields(entry, ["description", "prompt"]);
      return {
        description: string(image.description, "图片描述"),
        prompt: string(image.prompt, "绘图提示词"),
      };
    });
    if (!text && !images.length) {
      throw new Error("Twitter帖子正文和图片不能全部为空");
    }
    return createCampusPost({
      id: `${batchId}:post:${index}`,
      authorId: author(post.authorId),
      text,
      images,
      popular: post.popular,
    });
  });
}

function parseReply(
  raw: unknown,
  prior: readonly CampusComment[],
  existing: ReadonlySet<string>,
): string | null {
  if (raw === null) {
    return null;
  }
  if (typeof raw === "object" && raw !== null && Object.hasOwn(raw, "commentId")) {
    const { commentId } = fields(raw, ["commentId"]);
    if (typeof commentId !== "string" || !existing.has(commentId)) {
      throw new Error("Twitter回复指向未提供或已删除的评论");
    }
    return commentId;
  }
  const { batchIndex } = fields(raw, ["batchIndex"]);
  if (
    typeof batchIndex !== "number" ||
    !Number.isSafeInteger(batchIndex) ||
    batchIndex < 0 ||
    batchIndex >= prior.length
  ) {
    throw new Error("Twitter批内回复只能指向前序评论");
  }
  return prior[batchIndex]!.id;
}

function parseInteraction(
  value: Record<string, unknown>,
  target: CampusPromptTarget,
  batchId: string,
  author: (value: unknown) => string,
) {
  const existing = new Set(target.comments.filter(({ deleted }) => !deleted).map(({ id }) => id));
  const comments: CampusComment[] = [];
  for (const entry of list(value.comments, campusWindow.maxComments, "生成评论")) {
    const comment = fields(entry, ["authorId", "text", "replyTo"]);
    comments.push({
      id: `${batchId}:comment:${comments.length}`,
      authorId: author(comment.authorId),
      text: string(comment.text, "评论正文"),
      replyTo: parseReply(comment.replyTo, comments, existing),
      deleted: false,
      createdAt: Date.now(),
    });
  }
  if (!Array.isArray(value.likes)) {
    throw new Error("Twitter点赞应为数组");
  }
  const likes = [...new Set(value.likes.map(author))];
  return { postId: target.id, comments, likes };
}

/** 完整校验后才交出批次。批内 ID 派生自提交身份，显式重试保存可复用同一结果。 */
export function parseCampusBatch(
  output: string,
  id: string,
  candidateIds: readonly string[],
  target: CampusPromptTarget | undefined,
  automatic: boolean,
): CampusBatch {
  let json: unknown;
  try {
    json = JSON.parse(output);
  } catch (cause) {
    throw new Error("Twitter模型输出不是有效的 JSON", { cause });
  }
  const value = fields(json, target ? ["people", "likes", "comments"] : ["people", "posts"]);
  const allowed = new Set(candidateIds);
  const { accounts, people, newAccountIds } = parsePeople(value.people, id, allowed, automatic);
  const used = new Set<string>();
  function author(raw: unknown): string {
    if (typeof raw !== "string") {
      throw new Error("Twitter发言或点赞账号无效");
    }
    if (allowed.has(raw)) {
      return raw;
    }
    const newId = newAccountIds.get(raw);
    if (!newId) {
      throw new Error("Twitter使用了不在本批候选范围内的账号");
    }
    used.add(newId);
    return newId;
  }
  const posts = target ? [] : parsePosts(value.posts, id, author);
  const interaction = target ? parseInteraction(value, target, id, author) : undefined;
  if (accounts.some(({ id }) => !used.has(id))) {
    throw new Error("Twitter模型创建了未参与本批的路人");
  }
  return { id, accounts, people, posts, ...(interaction ? { interaction } : {}) };
}
