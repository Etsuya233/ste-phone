import type { AiTransport } from "../../core/ai/public.ts";
import type { DataAppPublic, CharacterProfile } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import type { WechatStickerLibrary } from "./wechat-sticker-library.ts";
import type { ReplyState, WechatConversation } from "./wechat.ts";
import { createWechatReplies } from "./wechat-reply.ts";

interface ReplyTask {
  controller: AbortController;
  conversationId: string;
  committing: boolean;
}

interface Dependencies {
  data: DataAppPublic;
  connections: ModelConnectionsReader;
  transport: AiTransport;
  stickers: WechatStickerLibrary;
  publish(state: ReplyState): void;
}
/** 一次回复拥有固定输入与取消信号；保存阶段完成撤回后才释放写入锁。 */
export class WechatReplySession {
  #task: ReplyTask | null = null;
  readonly #dependencies: Dependencies;
  constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
  }
  get busy(): boolean {
    return this.#task !== null;
  }
  get committing(): boolean {
    return this.#task?.committing === true;
  }

  async generateAndSave(input: {
    conversation: WechatConversation;
    sender: CharacterProfile;
    recipient: CharacterProfile;
    replyGuidance: string;
    save(conversation: WechatConversation, signal: AbortSignal): Promise<void>;
  }): Promise<void> {
    if (this.busy) {
      throw new Error("请等待当前回复完成");
    }
    const { conversation, sender, recipient, save } = input;
    const task: ReplyTask = {
      controller: new AbortController(),
      conversationId: conversation.id,
      committing: false,
    };
    this.#task = task;
    const { signal } = task.controller;
    this.#dependencies.publish({ status: "running", conversationId: conversation.id });
    try {
      const messages = await createWechatReplies({
        ...this.#dependencies,
        sender,
        recipient,
        replyGuidance: input.replyGuidance,
        conversation,
        stickerPacks: this.#dependencies.stickers.getSnapshot().packs,
        signal,
      });
      signal.throwIfAborted();
      task.committing = true;
      this.#dependencies.publish({ status: "saving", conversationId: conversation.id });
      const pendingReplies = { ...conversation.pendingReplies };
      delete pendingReplies[sender.id];
      await save(
        { ...conversation, pendingReplies, messages: [...conversation.messages, ...messages] },
        signal,
      );
      signal.throwIfAborted();
      this.#dependencies.publish({ status: "idle" });
    } catch (error) {
      if (this.#task === task) {
        const canceled = signal.aborted && (error as Error).name === "AbortError";
        this.#dependencies.publish(
          canceled
            ? { status: "idle" }
            : {
                status: "error",
                conversationId: conversation.id,
                error: task.committing
                  ? `回复保存失败：${(error as Error).message}`
                  : (error as Error).message,
                retry: true,
              },
        );
      }
    } finally {
      if (this.#task === task) {
        this.#task = null;
      }
    }
  }

  cancel(): void {
    const task = this.#task;
    task?.controller.abort();
    // 已发往宿主的保存无法靠中断 HTTP 撤销；存储层确认撤回期间禁止再次写入。
    if (task?.committing) {
      this.#dependencies.publish({ status: "stopping", conversationId: task.conversationId });
    } else {
      this.#task = null;
      this.#dependencies.publish({ status: "idle" });
    }
  }
}
