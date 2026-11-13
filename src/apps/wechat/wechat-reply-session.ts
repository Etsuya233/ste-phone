import type { AiTransport } from "../../core/ai/public.ts";
import type { DataAppPublic, CharacterProfile } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import type { WechatStickerLibrary } from "./wechat-sticker-library.ts";
import type { ReplyState, WechatConversation } from "./wechat.ts";
import { generateRepliedWechatConversation } from "./wechat-reply.ts";
import type { GeneratedWechatWrite } from "./wechat-writes.ts";

interface ReplyTask {
  controller: AbortController;
  detached: boolean;
  committing: boolean;
}

interface Dependencies {
  data: DataAppPublic;
  connections: ModelConnectionsReader;
  transport: AiTransport;
  stickers: WechatStickerLibrary;
  publish(state: ReplyState): void;
}
/** 一次回复拥有固定输入与取消信号；进入保存后等待原目标确认，再释放任务。 */
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
    historyMessageLimit: number;
    save(conversation: WechatConversation, generated: GeneratedWechatWrite): Promise<void>;
  }): Promise<void> {
    if (this.busy) {
      throw new Error("请等待当前回复完成");
    }
    const { conversation, sender, recipient, save } = input;
    const task: ReplyTask = {
      controller: new AbortController(),
      detached: false,
      committing: false,
    };
    this.#task = task;
    const { signal } = task.controller;
    this.#dependencies.publish({ status: "running", conversationId: conversation.id });
    try {
      const next = await generateRepliedWechatConversation({
        ...this.#dependencies,
        sender,
        recipient,
        replyGuidance: input.replyGuidance,
        historyMessageLimit: input.historyMessageLimit,
        conversation,
        stickerPacks: this.#dependencies.stickers.getSnapshot().packs,
        signal,
      });
      signal.throwIfAborted();
      await save(next, {
        signal,
        onWriting: () => {
          task.committing = true;
          this.#dependencies.publish({ status: "saving", conversationId: conversation.id });
        },
      });
      if (!task.detached) {
        this.#dependencies.publish({ status: "idle" });
      }
    } catch (error) {
      if (this.#task === task && !task.detached) {
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

  cancel(viewChanged = false): void {
    const task = this.#task;
    if (task?.committing) {
      // 切换聊天或资料只清理旧任务的展示，原目标的写入继续持有任务锁。
      if (viewChanged) {
        task.detached = true;
        this.#dependencies.publish({ status: "idle" });
      }
      return;
    }
    task?.controller.abort();
    this.#task = null;
    this.#dependencies.publish({ status: "idle" });
  }
}
