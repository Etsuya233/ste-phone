import { wechatMemoryBoundaries } from "./wechat-memory.ts";
import type { WechatConversation, WechatData, WechatSnapshot } from "./wechat.ts";
interface Dependencies {
  conversation(otherId: string): WechatConversation;
  busy(): boolean;
  chatName(): string;
  publish(patch: Partial<WechatSnapshot>): void;
  save(update: (data: WechatData) => WechatData): Promise<void>;
}
/** 屏障编辑在全局写入互斥内先保存后生效，失败归属保留原聊天名称。 */
export class WechatMemoryEditor {
  readonly #dependencies: Dependencies;
  constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
  }
  async insert(otherId: string, afterMessageId: string | null): Promise<string | null> {
    const conversation = this.#dependencies.conversation(otherId);
    const existing = conversation.memoryBarriers?.find(
      (item) => item.afterMessageId === afterMessageId,
    );
    if (existing) {
      return existing.id;
    }
    const id = [...crypto.getRandomValues(new Uint8Array(16))]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    return (await this.#saveBarriers(conversation, [
      ...(conversation.memoryBarriers ?? []),
      { id, afterMessageId, enabled: true },
    ]))
      ? id
      : null;
  }
  async setEnabled(otherId: string, id: string, enabled: boolean): Promise<void> {
    const conversation = this.#dependencies.conversation(otherId);
    if (!conversation.memoryBarriers?.some((item) => item.id === id)) {
      throw new Error("微信记忆屏障不存在");
    }
    await this.#saveBarriers(
      conversation,
      conversation.memoryBarriers.map((item) => (item.id === id ? { ...item, enabled } : item)),
    );
  }
  async delete(otherId: string, id: string): Promise<void> {
    const conversation = this.#dependencies.conversation(otherId);
    if (!conversation.memoryBarriers?.some((item) => item.id === id)) {
      throw new Error("微信记忆屏障不存在");
    }
    await this.#saveBarriers(
      conversation,
      conversation.memoryBarriers.filter((item) => item.id !== id),
    );
  }
  async #saveBarriers(
    conversation: WechatConversation,
    barriers: WechatConversation["memoryBarriers"],
  ): Promise<boolean> {
    if (this.#dependencies.busy()) {
      throw new Error("回复或保存结束后可修改；生成中可先停止");
    }
    const next = { ...conversation, memoryBarriers: barriers };
    wechatMemoryBoundaries(next);
    const target = `${this.#dependencies.chatName()} · ${conversation.people.map((person) => person.name).join("、")}`;
    this.#dependencies.publish({ barrierSaving: true, operationError: null });
    try {
      await this.#dependencies.save((data) => ({
        ...data,
        conversations: [...data.conversations.filter((item) => item.id !== next.id), next],
      }));
      return true;
    } catch (error) {
      this.#dependencies.publish({
        operationError: `${target}：记忆屏障保存失败，${(error as Error).message}`,
      });
      return false;
    } finally {
      this.#dependencies.publish({ barrierSaving: false });
    }
  }
}
