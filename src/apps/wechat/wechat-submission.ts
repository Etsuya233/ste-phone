import { createWechatMessage, appendWechatMessage, rollbackWechatMessage } from "./wechat.ts";
import type { WechatSnapshot, WechatConversation, WechatData } from "./wechat.ts";
interface Dependencies {
  snapshot(): WechatSnapshot;
  operation(): number;
  generation(): number;
  replyBusy(): boolean;
  conversation(otherId: string): WechatConversation;
  withConversation(conversation: WechatConversation): WechatData;
  save(update: (data: WechatData) => WechatData): Promise<void>;
  publish(patch: Partial<WechatSnapshot>): void;
}
/** 用户消息拥有乐观展示、原归属草稿及失败撤回的完整生命周期。 */
export class WechatSubmission {
  busy = false;
  readonly #drafts = new Map<string, string>();
  readonly #dependencies: Dependencies;
  constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
  }
  getDraft(otherId: string): string {
    return this.#drafts.get(this.#draftKey(otherId)) ?? "";
  }
  setDraft(otherId: string, value: string): void {
    this.#drafts.set(this.#draftKey(otherId), value);
  }
  #draftKey(otherId: string): string {
    const { chatId, scopeId, data } = this.#dependencies.snapshot();
    return JSON.stringify([chatId, scopeId, data.account?.id, otherId]);
  }

  /** 消息先显示再持久化；失败撤回本条消息，保留原会话和新草稿。 */
  async append(
    otherId: string,
    text: string,
    options: { onSent?: () => void; preserveDraft?: boolean } = {},
  ): Promise<boolean> {
    if (this.busy || this.#dependencies.replyBusy()) {
      throw new Error("请等待当前消息处理完成");
    }
    const value = text.trim();
    if (!value) {
      return false;
    }
    const conversation = this.#dependencies.conversation(otherId);
    const message = createWechatMessage(this.#dependencies.snapshot().data.account!.id, {
      type: "text",
      text: value,
    });
    const next = appendWechatMessage(conversation, message);
    const operation = this.#dependencies.operation();
    const generation = this.#dependencies.generation();
    const chatId = this.#dependencies.snapshot().chatId;
    const draftKey = this.#draftKey(otherId);
    this.busy = true;
    if (!options.preserveDraft) {
      this.setDraft(otherId, "");
    }
    this.#dependencies.publish({
      data: this.#dependencies.withConversation(next),
      reply: { status: "sending", conversationId: conversation.id },
    });
    try {
      await this.#dependencies.save(() => this.#dependencies.withConversation(next));
      if (operation === this.#dependencies.operation()) {
        this.#dependencies.publish({ reply: { status: "idle" } });
        options.onSent?.();
      }
      return true;
    } catch (error) {
      // 保存拥有发起时的草稿归属；切聊天或退出应用不能让失败正文丢失。
      if (!options.preserveDraft && !this.#drafts.get(draftKey)) {
        this.#drafts.set(draftKey, text);
      }
      if (
        this.#dependencies.generation() === generation &&
        this.#dependencies.snapshot().chatId === chatId &&
        this.#dependencies.snapshot().data.account?.id === message.senderId
      ) {
        const current = this.#dependencies
          .snapshot()
          .data.conversations.find((item) => item.id === conversation.id);
        if (current?.messages.some((item) => item.id === message.id)) {
          this.#dependencies.publish({
            data: rollbackWechatMessage(
              this.#dependencies.snapshot().data,
              conversation,
              message.id,
            ),
          });
        }
        this.#dependencies.publish({
          reply: {
            status: "error",
            conversationId: conversation.id,
            error: (error as Error).message,
            retry: false,
          },
        });
      }
      return false;
    } finally {
      this.busy = false;
      // 全局提交锁排除了另一条用户发送；旧聊天完成后也必须释放全局 sending 状态。
      if (this.#dependencies.snapshot().reply.status === "sending") {
        this.#dependencies.publish({ reply: { status: "idle" } });
      }
    }
  }
}
