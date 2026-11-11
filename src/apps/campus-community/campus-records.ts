import { CAMPUS_MAX_IMAGES, type CampusData } from "./campus-domain.ts";

function invalid(field: string): never {
  throw new Error(`Twitter存储格式无效：${field}`);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid(field);
  }
  return value as Record<string, unknown>;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    invalid(field);
  }
  return value;
}

function id(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    invalid(field);
  }
  return value;
}

function unique(ids: Set<string>, value: unknown, field: string): void {
  const key = id(value, field);
  if (ids.has(key)) {
    invalid(field);
  }
  ids.add(key);
}

function reference(ids: Set<string>, value: unknown, field: string): void {
  if (!ids.has(id(value, field))) {
    invalid(field);
  }
}

function readPeople(value: unknown): Set<string> {
  const ids = new Set<string>();
  for (const item of list(value, "路人")) {
    const person = record(item, "路人");
    unique(ids, person.id, "路人 ID");
    if (typeof person.profile !== "string" || typeof person.disabled !== "boolean") {
      invalid("路人资料");
    }
  }
  return ids;
}

function readAccounts(value: unknown, people: Set<string>): Set<string> {
  const entries = list(value, "账号").map((item) => record(item, "账号"));
  const ids = new Set<string>();
  for (const account of entries) {
    unique(ids, account.id, "账号 ID");
    id(account.nickname, "账号昵称");
    if (
      typeof account.avatar !== "string" ||
      typeof account.bio !== "string" ||
      typeof account.style !== "string" ||
      typeof account.disabled !== "boolean" ||
      typeof account.privateIdentity !== "boolean"
    ) {
      invalid("账号资料");
    }
    const owner = record(account.owner, "账号归属");
    switch (owner.kind) {
      case "memory":
        id(owner.id, "剧情人物身份");
        break;
      case "person":
        reference(people, owner.id, "路人归属");
        break;
      case "public":
        break;
      default:
        invalid("账号归属类型");
    }
  }
  for (const account of entries) {
    const following = new Set<string>();
    for (const target of list(account.following, "关注列表")) {
      if (target === account.id) {
        invalid("自我关注");
      }
      reference(ids, target, "关注账号");
      unique(following, target, "重复关注");
    }
  }
  return ids;
}

function readImages(value: unknown): number {
  const images = list(value, "帖子图片");
  if (images.length > CAMPUS_MAX_IMAGES) {
    invalid("帖子图片数量");
  }
  for (const item of images) {
    const image = record(item, "帖子图片");
    if (typeof image.description !== "string") {
      invalid("图片描述");
    }
    if (image.prompt !== undefined && typeof image.prompt !== "string") {
      invalid("绘图提示词");
    }
    if (image.image !== undefined) {
      const attachment = record(image.image, "图库引用");
      id(attachment.id, "图库 ID");
      id(attachment.path, "图库路径");
    } else if (!image.description.trim()) {
      invalid("图片占位描述");
    }
  }
  return images.length;
}

function readComments(value: unknown, accounts: Set<string>): void {
  const ids = new Set<string>();
  // Saved replies can only target an earlier entry in the same post, including a deleted anchor.
  for (const item of list(value, "帖子评论")) {
    const comment = record(item, "帖子评论");
    reference(accounts, comment.authorId, "评论作者");
    if (comment.replyTo !== null) {
      reference(ids, comment.replyTo, "回复目标");
    }
    unique(ids, comment.id, "评论 ID");
    if (typeof comment.deleted !== "boolean") {
      invalid("评论删除状态");
    }
    if (comment.createdAt !== undefined) {
      count(comment.createdAt, "评论时间");
    }
    if (comment.deleted) {
      if (typeof comment.text !== "string") {
        invalid("已删除评论正文");
      }
    } else {
      id(comment.text, "评论正文");
    }
  }
}

function count(value: unknown, field: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    invalid(field);
  }
}

function readPosts(value: unknown, accounts: Set<string>): void {
  const ids = new Set<string>();
  for (const item of list(value, "帖子")) {
    const post = record(item, "帖子");
    unique(ids, post.id, "帖子 ID");
    reference(accounts, post.authorId, "帖子作者");
    const images = readImages(post.images);
    if (typeof post.text !== "string" || (!post.text.trim() && !images)) {
      invalid("帖子正文");
    }
    count(post.createdAt, "发帖时间");
    count(post.backgroundLikes, "背景点赞数");
    count(post.backgroundComments, "背景评论数");
    const likes = new Set<string>();
    for (const account of list(post.likes, "帖子点赞")) {
      reference(accounts, account, "点赞账号");
      unique(likes, account, "重复点赞");
    }
    readComments(post.comments, accounts);
  }
}

export function readCampusData(value: unknown): CampusData {
  const data = record(value, "社区数据");
  const people = readPeople(data.people);
  const accounts = readAccounts(data.accounts, people);
  if (data.activeAccountId !== null) {
    reference(accounts, data.activeAccountId, "操作账号");
  }
  readPosts(data.posts, accounts);
  const batches = new Set<string>();
  for (const batch of list(data.appliedBatches, "已保存批次")) {
    unique(batches, batch, "批次 ID");
  }
  return data as unknown as CampusData;
}
