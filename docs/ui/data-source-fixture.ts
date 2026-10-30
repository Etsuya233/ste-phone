import type {
  BackgroundProvider,
  PhoneBackground,
  SourceContext,
} from "../../src/features/background/index.ts";

/** Preview-only provider. Never connects to ST or writes real chat data. */
export function createPreviewProvider(mode: string | null): BackgroundProvider {
  const context: SourceContext = {
    sourceName: "预览资料",
    chatIdentity: "preview:story",
    chatName: "放学之后 · 独立预览",
    scopeId: "preview-space",
    spaceName: "示例剧情",
    available: mode !== "unavailable",
    message: mode === "unavailable" ? "预览：当前未连接资料来源" : null,
  };
  const data: PhoneBackground = {
    sourceId: "preview",
    scopeId: "preview-space",
    characters:
      mode === "empty"
        ? []
        : [
            {
              id: "red",
              name: "小红",
              profileText:
                "身份：高二学生、文学社成员\n性格：直率，习惯把细小的事情记在本子上。\n经历：上学期加入文学社，与小蓝一起负责校刊。\n近况：正在准备周五的朗读会，放学后留在图书馆整理稿件。",
            },
            {
              id: "blue",
              name: "小蓝",
              profileText:
                "身份：高二学生\n性格：安静，做事认真。\n近况：答应帮助小红校对稿件，明天带来最后一版。",
            },
            {
              id: "another-red",
              name: "小红",
              profileText: "身份：另一班的同名同学\n近况：今天没有参与文学社活动。",
            },
          ],
    chronicles:
      mode === "empty"
        ? []
        : [
            {
              id: "event-1",
              title: "图书馆里的约定",
              content:
                "开始时间：2026-10-30 16:30:00\n纪要：放学后，小红与小蓝在图书馆讨论朗读会的稿件。小蓝答应明天带来校对后的版本。\n相关人物：小红、小蓝",
            },
            {
              id: "event-2",
              title: "借出的笔记本",
              content:
                "纪要：小红将自己的笔记本借给小蓝，方便对照校刊中的引文。\n相关人物：小红、小蓝\n关键对白：明天记得带来，我还想补上最后一段。",
            },
          ],
    items:
      mode === "empty"
        ? []
        : [
            {
              id: "notebook",
              name: "蓝色笔记本",
              description:
                "持有者：小蓝\n描述：小红用来整理引文的笔记本，封面贴着一张星星贴纸。\n近况：借给小蓝用于校对，约定明天归还。",
            },
          ],
  };
  return {
    getContext: () => context,
    subscribe: () => () => {},
    async read() {
      if (mode === "error") throw new Error("预览：纪要表缺少 details 字段，请核对 Memory 结构");
      return data;
    },
  };
}
