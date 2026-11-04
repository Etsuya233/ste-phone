import type { ImageHub, ImageRecord } from "../../core/image-hub/public.ts";
import type { AiTransport } from "../../core/ai/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import type { DiaryEntry, DiarySettings } from "./diary.ts";
import { generateDiaryText, parseImagePrompt } from "./diary-generation.ts";

export type DiaryImageAction =
  | { type: "prompt"; prompt: string }
  | { type: "select"; image: ImageRecord }
  | { type: "generate" }
  | { type: "create-prompt" };

interface ImageTaskOwner {
  ownsTask(): boolean;
  phase(status: "prompting" | "generating" | "saving"): void;
  save(entry: DiaryEntry): Promise<void>;
}

/** 配图协议、Hub 生成与关联失败语义集中于此，聊天任务归属由日记服务统一持有。 */
export class DiaryImages {
  readonly #dependencies: {
    imageHub: ImageHub;
    connections: ModelConnectionsReader;
    transport: AiTransport;
  };
  constructor(dependencies: {
    imageHub: ImageHub;
    connections: ModelConnectionsReader;
    transport: AiTransport;
  }) {
    this.#dependencies = dependencies;
  }

  async applyImageAction(
    entry: DiaryEntry,
    action: DiaryImageAction,
    settings: DiarySettings,
    signal: AbortSignal,
    owner: ImageTaskOwner,
  ): Promise<void> {
    switch (action.type) {
      case "prompt":
        await owner.save({
          ...entry,
          imagePrompt: parseImagePrompt({ imagePrompt: action.prompt }),
        });
        return;
      case "select":
        await owner.save({
          ...entry,
          image: { id: action.image.id, imagePath: action.image.imagePath },
        });
        return;
      case "create-prompt": {
        owner.phase("prompting");
        const { connections, transport } = this.#dependencies;
        const id = connections.getSnapshot().defaultModelConnectionId;
        if (!id) {
          throw new Error("请先在设置中选择默认模型连接");
        }
        // 提炼只使用这篇日记保存时的作者和正文，不重新读取当前剧情背景。
        const text = await generateDiaryText({
          transport,
          connection: connections.getConnection(id),
          settings,
          prompt: JSON.stringify({ author: entry.author, body: entry.body }),
          signal,
          imagePromptOnly: true,
          onThinking() {},
        });
        const imagePrompt = parseImagePrompt(JSON.parse(text) as Record<string, unknown>);
        if (owner.ownsTask()) {
          await owner.save({ ...entry, imagePrompt });
        }
        return;
      }
      case "generate": {
        const prompt = parseImagePrompt({ imagePrompt: entry.imagePrompt });
        owner.phase("generating");
        // Hub 不提供取消；退出后仍由 Hub 保存图片，本地只阻止迟到关联。
        const images = await this.#dependencies.imageHub.generate({ prompt });
        if (!owner.ownsTask()) {
          return;
        }
        const image = images[0];
        if (!image) {
          throw new Error("Image Hub 未返回图片");
        }
        try {
          await owner.save({ ...entry, image: { id: image.id, imagePath: image.imagePath } });
        } catch (error) {
          throw new Error("配图关联保存失败，图片已存入图库，请重新选取", { cause: error });
        }
      }
    }
  }
}
