import type { GalleryImageReference } from "../gallery/public.ts";
import type { DataScope } from "../data-source/public.ts";

export interface CampusAccount {
  id: string;
  owner: { kind: "memory"; id: string } | { kind: "person"; id: string } | { kind: "public" };
  nickname: string;
  avatar: string | GalleryImageReference;
  bio: string;
  style: string;
  disabled: boolean;
  following: string[];
  privateIdentity: boolean;
}

export interface CampusPerson {
  id: string;
  profile: string;
  disabled: boolean;
}

export const CAMPUS_MAX_IMAGES = 9;

export interface CampusImage {
  description: string;
  prompt?: string;
  image?: GalleryImageReference;
}

export interface CampusComment {
  id: string;
  authorId: string;
  text: string;
  replyTo: string | null;
  deleted: boolean;
  /** 旧数据没有该字段；新评论用于显示本地发送时间。 */
  createdAt?: number;
}

export interface CampusPost {
  id: string;
  authorId: string;
  text: string;
  images: CampusImage[];
  createdAt: number;
  backgroundLikes: number;
  backgroundComments: number;
  likes: string[];
  comments: CampusComment[];
}

export interface CampusData {
  version: 2;
  accounts: CampusAccount[];
  people: CampusPerson[];
  posts: CampusPost[];
  activeAccountId: string | null;
  appliedBatches: string[];
}

export interface CampusGenerationRequest {
  id: string;
  scope: DataScope;
  data: CampusData;
  accountIds: string[];
  instruction: string;
  postId: string | null;
}

export interface CampusBatch {
  id: string;
  accounts: CampusAccount[];
  people: CampusPerson[];
  posts: CampusPost[];
  interaction?: { postId: string; likes: string[]; comments: CampusComment[] };
}

export interface CampusStorage {
  read(chatId: string, space: string): CampusData | null;
  write(chatId: string, space: string, data: CampusData): Promise<void>;
}

export function emptyCampus(): CampusData {
  return {
    version: 2,
    accounts: [],
    people: [],
    posts: [],
    activeAccountId: null,
    appliedBatches: [],
  };
}

export function createCampusId(): string {
  // getRandomValues is available on the LAN preview and HTTP SillyTavern.
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function createCampusPost(input: {
  id: string;
  authorId: string;
  text: string;
  images: CampusImage[];
  backgroundLikes: number;
  backgroundComments: number;
}): CampusPost {
  return {
    ...input,
    createdAt: Date.now(),
    likes: [],
    comments: [],
  };
}

export function appendCampusBatch(data: CampusData, batch: CampusBatch): CampusData {
  // A retry retains its original ID and can be applied at most once.
  if (data.appliedBatches.includes(batch.id)) {
    return data;
  }
  const interaction = batch.interaction;
  if (interaction && !data.posts.some(({ id }) => id === interaction.postId)) {
    throw new Error("原帖子已删除，无法保存本批互动");
  }
  return {
    ...data,
    accounts: [...data.accounts, ...batch.accounts],
    people: [...data.people, ...batch.people],
    posts: [
      ...data.posts.map((post) =>
        post.id === interaction?.postId
          ? {
              ...post,
              likes: [...new Set([...post.likes, ...interaction.likes])],
              comments: [...post.comments, ...interaction.comments],
            }
          : post,
      ),
      ...batch.posts,
    ],
    appliedBatches: [...data.appliedBatches, batch.id],
  };
}
