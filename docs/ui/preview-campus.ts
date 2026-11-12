import {
  emptyCampus,
  type CampusAccount,
  type CampusData,
  type CampusStorage,
} from "../../src/apps/campus-community/campus-domain.ts";
import { readCampusData } from "../../src/apps/campus-community/campus-records.ts";

function sampleAccount(id: string, nickname: string, owner: CampusAccount["owner"]): CampusAccount {
  return {
    id,
    nickname,
    owner,
    avatar: "",
    bio: "",
    style: "",
    disabled: false,
    following: [],
    privateIdentity: id === "drafts",
  };
}

function sampleCampus(): CampusData {
  const accounts = [
    sampleAccount("literature", "小红", { kind: "memory", id: "red" }),
    sampleAccount("drafts", "草稿纸背面", { kind: "memory", id: "red" }),
    sampleAccount("notice", "校园公告栏", { kind: "public" }),
    sampleAccount("window", "靠窗同学", { kind: "person", id: "window-person" }),
  ];
  accounts[0]!.following = ["notice"];
  return {
    ...emptyCampus(),
    accounts,
    people: [
      { id: "window-person", profile: "高一学生，常在校图书馆靠窗座位写作业。", disabled: false },
    ],
    activeAccountId: "literature",
    posts: [
      {
        id: "reading",
        authorId: "notice",
        text: "周五的朗读会正在准备中。文学社在校对最后一版稿件，有兴趣的同学可以来看看。",
        images: [{ description: "图书馆窗边的蓝色笔记本与朗读会稿件" }],
        createdAt: Date.now() - 120000,
        backgroundLikes: 1200,
        backgroundComments: 1000,
        likes: [],
        comments: [
          {
            id: "first",
            authorId: "window",
            text: "听说窗边的位置最抢手，真的嘛？",
            replyTo: null,
            deleted: false,
          },
        ],
      },
      {
        id: "notebook",
        authorId: "literature",
        text: "在图书馆核完第一轮稿子。有人捡到一枚夹在本子里的银色书签吗？",
        images: [],
        createdAt: Date.now() - 60000,
        backgroundLikes: 24,
        backgroundComments: 0,
        likes: [],
        comments: [],
      },
    ],
  };
}

export function createPreviewCampusStorage(mode: string | null): CampusStorage {
  let failBatch = mode === "save-error";
  let failAccounts = mode === "account-save-error";
  const key = (chatId: string, space: string) =>
    `ste-phone-preview-campus-v1:${mode ?? "normal"}:${chatId}:${space}`;
  return {
    read(chatId, space) {
      const raw = localStorage.getItem(key(chatId, space));
      return raw === null
        ? mode === "empty"
          ? emptyCampus()
          : sampleCampus()
        : readCampusData(JSON.parse(raw));
    },
    async write(chatId, space, data) {
      if (mode === "slow-save") {
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }
      if (failBatch && data.appliedBatches.length) {
        failBatch = false;
        throw new Error("模拟校园社区保存失败，请重试保存");
      }
      if (failAccounts) {
        failAccounts = false;
        throw new Error("模拟账号保存失败，请重试创建");
      }
      localStorage.setItem(key(chatId, space), JSON.stringify(readCampusData(data)));
    },
  };
}

const voices = [
  "刚从图书馆路过，门口挺热闹的。",
  "我也想问！有同学知道细节吗？",
  "下午有人聊到这件事，我还以为听岔了。",
  "等有消息回来更新一下，我先去写作业。",
  "我们班有同学感兴趣，已经把这条转述给他们了。",
  "我记得去年也有人在这里问过类似的事。",
  "先蹲一个后续，今天最后一节课拖堂了。",
  "要是我碰见，就来这条下面留言。",
  "中午图书馆安静一点，可以早点过去看看。",
  "等等，这件事我听到的版本有点不同。",
];

export function previewCampusOutput(content: string, mode: string | null): string {
  if (mode === "invalid") {
    return "模拟非法 JSON";
  }
  const input = JSON.parse(content) as {
    accounts: { id: string }[];
    targetPost?: { actualCommentCount: number; comments: { id: string; deleted?: boolean }[] };
    automatic: boolean;
  };
  const ids = input.accounts.map(({ id }) => id);
  const people =
    input.automatic || !ids.length
      ? [
          {
            key: "new:1",
            nickname: "晚自习前",
            bio: "走读生",
            style: "简短口语",
            profile: "高二走读生，放学后在图书馆等车。",
          },
        ]
      : [];
  if (people.length) {
    ids.push("new:1");
  }
  const target = input.targetPost;
  if (target) {
    const existing = target.comments.findLast(({ deleted }) => !deleted)?.id;
    return JSON.stringify({
      people,
      likes: ids,
      comments: Array.from({ length: target.actualCommentCount ? 5 : 20 }, (_, i) => ({
        authorId: ids[i % ids.length],
        text: `${voices[i % voices.length]}${i >= voices.length ? " 刚才又问了一圈。" : ""}`,
        replyTo:
          i % 3 === 0
            ? null
            : existing && i === 1
              ? { commentId: existing }
              : { batchIndex: i - 1 },
      })),
    });
  }
  return JSON.stringify({
    people,
    posts: [
      {
        authorId: ids.at(-1),
        text: "【模拟】窗边座位的阳光落在今天的稿纸上。",
        images: [
          {
            description: "图书馆窗边的稿纸",
            prompt: "安静的校园图书馆，夕阳掠过蓝色笔记本和书稿，纪实摄影。",
          },
        ],
        backgroundLikes: 0,
        backgroundComments: 0,
      },
      {
        authorId: ids[0],
        text: "【模拟】明天午休还去图书馆，有人一起吗？",
        images: [],
        backgroundLikes: 0,
        backgroundComments: 0,
      },
      {
        authorId: ids[1 % ids.length],
        text: "【模拟】周五朗读会的稿子正在校对。",
        images: [],
        backgroundLikes: 1234,
        backgroundComments: 1056,
      },
    ],
  });
}
