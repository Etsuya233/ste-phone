import type {
  CampusAccount,
  CampusComment,
  CampusData,
  CampusImage,
  CampusPerson,
  CampusPost,
} from "./campus-domain.ts";

export type CampusCommand =
  | { type: "publish"; post: CampusPost }
  | { type: "comment"; postId: string; comment: CampusComment }
  | { type: "delete-comment"; postId: string; commentId: string }
  | { type: "delete-post"; postId: string }
  | { type: "like"; postId: string }
  | { type: "follow"; accountId: string }
  | { type: "heat"; postId: string; likes: number; comments: number }
  | { type: "account"; account: CampusAccount; person?: CampusPerson }
  | { type: "image"; postId: string; index: number; image: CampusImage };

function requireActiveAccount(data: CampusData): CampusAccount {
  const account = data.accounts.find(
    ({ id, disabled }) => id === data.activeAccountId && !disabled,
  );
  if (!account) {
    throw new Error("请先选择一个有效操作账号");
  }
  return account;
}

function toggleId(ids: string[], target: string): string[] {
  return ids.includes(target) ? ids.filter((id) => id !== target) : [...ids, target];
}

function saveAccount(data: CampusData, account: CampusAccount, person?: CampusPerson): CampusData {
  const previous = data.accounts.find(({ id }) => id === account.id);
  const updated = { ...account, following: previous?.following ?? [] };
  const accounts = previous
    ? data.accounts.map((entry) => (entry.id === account.id ? updated : entry))
    : [...data.accounts, updated];
  let people = data.people;
  if (person) {
    if (account.owner.kind !== "person" || account.owner.id !== person.id) {
      throw new Error("路人资料与账号归属不一致");
    }
    people = people.some(({ id }) => id === person.id)
      ? people.map((entry) => (entry.id === person.id ? person : entry))
      : [...people, person];
  }
  const active =
    accounts.find(({ id, disabled }) => id === data.activeAccountId && !disabled) ??
    accounts.find(({ owner, disabled }) => owner.kind === "memory" && !disabled);
  return { ...data, accounts, people, activeAccountId: active?.id ?? null };
}

function editPost(
  post: CampusPost,
  data: CampusData,
  command: Exclude<CampusCommand, { type: "account" | "publish" | "follow" | "delete-post" }>,
): CampusPost {
  switch (command.type) {
    case "like":
      return { ...post, likes: toggleId(post.likes, requireActiveAccount(data).id) };
    case "heat":
      return { ...post, backgroundLikes: command.likes, backgroundComments: command.comments };
    case "image":
      if (!post.images[command.index]) {
        throw new Error("所选图片已不存在");
      }
      return {
        ...post,
        images: post.images.map((image, index) =>
          index === command.index ? command.image : image,
        ),
      };
    case "comment": {
      const { comment } = command;
      if (
        comment.replyTo !== null &&
        !post.comments.some(({ id, deleted }) => id === comment.replyTo && !deleted)
      ) {
        throw new Error("回复目标已删除或不存在");
      }
      return {
        ...post,
        comments: [
          ...post.comments,
          { ...comment, authorId: requireActiveAccount(data).id, deleted: false },
        ],
      };
    }
    case "delete-comment": {
      const target = post.comments.find(({ id }) => id === command.commentId);
      if (!target || target.deleted || target.authorId !== requireActiveAccount(data).id) {
        throw new Error("只能删除当前账号的有效评论");
      }
      // Keep the stable anchor so existing replies retain their target.
      return {
        ...post,
        comments: post.comments.map((comment) =>
          comment.id === target.id ? { ...comment, deleted: true, text: "" } : comment,
        ),
      };
    }
  }
}

export function applyCampusCommand(data: CampusData, command: CampusCommand): CampusData {
  if (command.type === "account") {
    return saveAccount(data, command.account, command.person);
  }
  if (command.type === "publish") {
    const account = requireActiveAccount(data);
    const post = { ...command.post, authorId: account.id, comments: [], likes: [] };
    return { ...data, posts: [...data.posts, post] };
  }
  if (command.type === "follow") {
    const account = requireActiveAccount(data);
    const target = data.accounts.find(({ id }) => id === command.accountId);
    if (
      !target ||
      target.id === account.id ||
      (target.disabled && !account.following.includes(target.id))
    ) {
      throw new Error("该账号无法关注");
    }
    const updated = { ...account, following: toggleId(account.following, target.id) };
    return {
      ...data,
      accounts: data.accounts.map((entry) => (entry.id === account.id ? updated : entry)),
    };
  }
  const post = data.posts.find(({ id }) => id === command.postId);
  if (!post) {
    throw new Error("帖子已删除");
  }
  if (command.type === "delete-post") {
    if (post.authorId !== requireActiveAccount(data).id) {
      throw new Error("只能删除当前账号发布的帖子");
    }
    return { ...data, posts: data.posts.filter(({ id }) => id !== post.id) };
  }
  const updated = editPost(post, data, command);
  return { ...data, posts: data.posts.map((entry) => (entry.id === post.id ? updated : entry)) };
}
