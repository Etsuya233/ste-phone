import type { WechatData, WechatPerson } from "../../src/apps/wechat/wechat.ts";

/** 仅在无已保存预览数据时使用，覆盖媒体、历史人物与删除目标回复。 */
export function previewWechatMoments(): WechatData {
  const red: WechatPerson = { id: "red", name: "小红", scopeId: "preview-space" };
  const blue: WechatPerson = { id: "blue", name: "小蓝", scopeId: "preview-space" };
  return {
    version: 1,
    account: red,
    conversations: [],
    moments: {
      "preview-space": [
        {
          id: "moment-demo-images",
          author: red,
          text: "今天的光很温柔。\n\n把小小的日常留在这里。",
          media: {
            type: "images",
            items: [
              "窗边摊开的蓝色笔记本，纸上留着几行修改后的句子。",
              "图书馆外的树叶，阳光从叶片之间落下来。",
              "一杯热牛奶，杯沿上方有很淡的热气。",
            ].map((description) => ({ description, prompt: description.trim() })),
          },
          createdAt: "2026-11-03T08:00:00.000Z",
          comments: [
            {
              id: "comment-demo",
              author: blue,
              text: "第二张很好看。",
              createdAt: "2026-11-03T08:01:00.000Z",
            },
            {
              id: "reply-demo",
              author: red,
              text: "下次一起去吧。",
              createdAt: "2026-11-03T08:02:00.000Z",
              replyTo: { commentId: "comment-deleted", author: blue },
            },
          ],
        },
        {
          id: "moment-demo-video",
          author: blue,
          text: "",
          media: {
            type: "video",
            description: "短视频里，风吹过图书馆外的树梢，远处有人抱着书快步走过。",
          },
          createdAt: "2026-11-03T08:03:00.000Z",
          comments: [],
        },
        {
          id: "moment-demo-history",
          author: { id: "former-person", scopeId: "preview-space", name: "离开的人" },
          text: "曾经记录的这一刻，仍然留在这里。",
          media: { type: "none" },
          createdAt: "2026-11-03T08:04:00.000Z",
          comments: [],
        },
      ],
    },
  };
}
