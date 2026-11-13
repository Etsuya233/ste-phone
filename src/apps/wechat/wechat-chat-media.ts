import type { AiTransport } from "../../core/ai/public.ts";
import type { ImageHub } from "../../core/image-hub/public.ts";
import {
  fromHubImage,
  galleryImageReference,
  isGalleryImageReference,
  type GalleryImageReference,
} from "../gallery/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import { generateRefinedImagePrompt } from "./wechat-image-prompt.ts";
import { applyWechatPaymentAction, type WechatPaymentAction } from "./wechat-message-content.ts";
import type { WechatConversation, WechatData, WechatSnapshot } from "./wechat.ts";

interface Dependencies {
  imageHub: ImageHub;
  connections: ModelConnectionsReader;
  transport: AiTransport;
  snapshot(): WechatSnapshot;
  conversation(otherId: string): WechatConversation;
  busy(): boolean;
  save(update: (data: WechatData) => WechatData): Promise<void>;
  publishBusy(busy: boolean): void;
}

/** 单聊附件的异步生成与已发送卡片的更新均由原会话拥有。 */
export class WechatChatMedia {
  readonly #dependencies: Dependencies;
  #generation: AbortController | null = null;

  constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
  }

  async refineImagePrompt(otherId: string, description: string, prompt = ""): Promise<string> {
    if (!description.trim()) {
      throw new Error("请先填写图片描述");
    }
    const { people } = this.#dependencies.conversation(otherId);
    const material = `${description}\n${prompt}`;
    const characters = this.#dependencies
      .snapshot()
      .people.filter(
        ({ id, name }) => people.some((person) => person.id === id) || material.includes(name),
      )
      .map(({ id, name, profileText }) => ({ id, name, profileText }));
    const input = JSON.stringify({ participants: people, description, prompt, characters });
    return this.#generate((signal) =>
      generateRefinedImagePrompt(this.#dependencies, "微信图片提示词", input, signal),
    );
  }

  async generateChatImage(otherId: string, prompt: string): Promise<GalleryImageReference> {
    this.#dependencies.conversation(otherId);
    const value = prompt.trim();
    if (!value) {
      throw new Error("请先填写绘图 Prompt");
    }
    return this.#generate(async () => {
      const [image] = await this.#dependencies.imageHub.generate({ prompt: value });
      if (!image) {
        throw new Error("Image Hub 未返回图片");
      }
      return galleryImageReference(fromHubImage(image));
    });
  }

  async setChatImage(
    otherId: string,
    messageId: string,
    image: GalleryImageReference | undefined,
    prompt: string,
  ): Promise<void> {
    if (image !== undefined && !isGalleryImageReference(image)) {
      throw new Error("图库图片引用无效");
    }
    await this.#updateConversation(otherId, (conversation) => {
      const index = conversation.messages.findIndex((message) => message.id === messageId);
      const message = conversation.messages[index];
      if (!message || message.recalled || message.content.type !== "image") {
        throw new Error("图片消息已撤回或不存在");
      }
      return {
        ...conversation,
        messages: conversation.messages.with(index, {
          ...message,
          content: {
            ...message.content,
            prompt: prompt.trim(),
            image: image && galleryImageReference(image),
          },
        }),
      };
    });
  }

  async actOnPayment(
    otherId: string,
    messageId: string,
    action: WechatPaymentAction,
  ): Promise<void> {
    await this.#updateConversation(otherId, (conversation, actorId) =>
      applyWechatPaymentAction(conversation, actorId, messageId, action),
    );
  }

  async #updateConversation(
    otherId: string,
    update: (conversation: WechatConversation, actorId: string) => WechatConversation,
  ): Promise<void> {
    if (this.#dependencies.busy()) {
      throw new Error("请等待当前消息处理完成");
    }
    const { id } = this.#dependencies.conversation(otherId);
    const actorId = this.#dependencies.snapshot().data.account!.id;
    await this.#dependencies.save((data) => {
      const index = data.conversations.findIndex((conversation) => conversation.id === id);
      const conversation = data.conversations[index];
      if (!conversation) {
        throw new Error("单聊不存在");
      }
      return {
        ...data,
        conversations: data.conversations.with(index, update(conversation, actorId)),
      };
    });
  }

  async #generate<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if (this.#dependencies.busy()) {
      throw new Error("请等待当前消息处理完成");
    }
    const controller = new AbortController();
    this.#generation = controller;
    this.#dependencies.publishBusy(true);
    try {
      const result = await run(controller.signal);
      // Hub 无法取消已提交任务。迟到的图片留在图库，不交给已经离开的会话。
      controller.signal.throwIfAborted();
      return result;
    } finally {
      if (this.#generation === controller) {
        this.#generation = null;
        this.#dependencies.publishBusy(false);
      }
    }
  }

  cancel(): void {
    if (this.#generation) {
      this.#generation.abort();
      this.#generation = null;
      this.#dependencies.publishBusy(false);
    }
  }
}
