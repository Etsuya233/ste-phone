import type { ChatContext } from "../../core/chat/public.ts";
import type { AppIntentSource } from "../../core/phone-context/public.ts";
import type { WechatIntentStorage } from "./ports/wechat-intent-storage.ts";
import type { WechatStorage } from "./ports/wechat-storage.ts";
import type { WechatIntent, WechatIntentData, WechatIntentSnapshot } from "./wechat-intent.ts";
import { validateWechatIntent, validateWechatIntentData } from "./wechat-intent.ts";
import { createWechatContextSource } from "./wechat-context-export.ts";

/** Intent 配置和读取由微信拥有，公开来源只接受已保存方案的稳定标识。 */
export class WechatIntentService {
  readonly #chat: ChatContext;
  readonly #storage: WechatIntentStorage;
  readonly #messages: ReturnType<typeof createWechatContextSource>;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: () => void;
  #snapshot: WechatIntentSnapshot = { chatId: null, intents: [], saving: false, error: null };
  #generation = 0;

  readonly source: AppIntentSource = {
    id: "wechat",
    label: "微信",
    listIntents: (chatId) => this.#read(chatId).intents.map(({ id, name }) => ({ id, name })),
    readIntent: ({ chatId, intentId, now }) => {
      const intent = this.#read(chatId).intents.find(({ id }) => id === intentId);
      if (!intent) {
        throw new Error(`微信 App Intent 已删除或不存在：${intentId}`);
      }
      return this.#messages.read({ chatId, selection: intent.selection, now }).text;
    },
  };

  constructor(dependencies: {
    chat: ChatContext;
    storage: WechatIntentStorage;
    messageStorage: WechatStorage;
  }) {
    this.#chat = dependencies.chat;
    this.#storage = dependencies.storage;
    this.#messages = createWechatContextSource(dependencies.messageStorage);
    this.#unsubscribe = this.#chat.subscribe(this.#chatChanged);
    this.#refresh();
  }

  getSnapshot = (): WechatIntentSnapshot => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  dispose(): void {
    this.#unsubscribe();
    this.#listeners.clear();
  }

  listScopes() {
    return this.#messages.listScopes(this.#chatId());
  }

  preview(intent: WechatIntent) {
    validateWechatIntent(intent);
    return this.#messages.read({
      chatId: this.#chatId(),
      selection: intent.selection,
      now: Date.now(),
    });
  }

  async save(intent: WechatIntent): Promise<void> {
    validateWechatIntent(intent);
    const value = structuredClone(intent);
    await this.#write((data) => ({
      version: 1,
      intents: [...data.intents.filter(({ id }) => id !== value.id), value],
    }));
  }

  async remove(id: string): Promise<void> {
    await this.#write((data) => {
      if (!data.intents.some((intent) => intent.id === id)) {
        throw new Error(`微信 App Intent 不存在：${id}`);
      }
      return { version: 1, intents: data.intents.filter((intent) => intent.id !== id) };
    });
  }

  async #write(update: (data: WechatIntentData) => WechatIntentData): Promise<void> {
    if (this.#snapshot.saving) {
      throw new Error("微信 App Intent 正在保存");
    }
    const chatId = this.#chatId();
    const generation = this.#generation;
    const data = update(this.#read(chatId));
    this.#publish({ ...this.#snapshot, saving: true, error: null });
    try {
      await this.#storage.write(chatId, data);
      // 提交属于原聊天；切走再返回也重新读取，不能发布保存前的旧快照。
      this.#refresh();
    } catch (error) {
      if (generation === this.#generation) {
        this.#publish({
          ...this.#snapshot,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      throw error;
    } finally {
      this.#publish({ ...this.#snapshot, saving: false });
    }
  }

  #chatId(): string {
    const chatId = this.#chat.getSnapshot()?.id;
    if (!chatId) {
      throw new Error("请先打开一个 ST 聊天");
    }
    return chatId;
  }

  #read(chatId: string): WechatIntentData {
    if (chatId !== this.#chatId()) {
      throw new Error("当前 ST 聊天已变化，无法读取微信 App Intent");
    }
    const data = this.#storage.read(chatId) ?? { version: 1, intents: [] };
    validateWechatIntentData(data);
    return data;
  }

  #chatChanged = () => {
    if (this.#chat.getSnapshot()?.id !== this.#snapshot.chatId) {
      ++this.#generation;
      this.#refresh();
    }
  };

  #refresh(): void {
    const chatId = this.#chat.getSnapshot()?.id ?? null;
    try {
      const intents = chatId ? this.#read(chatId).intents : [];
      this.#publish({ ...this.#snapshot, chatId, intents, error: null });
    } catch (error) {
      this.#publish({
        ...this.#snapshot,
        chatId,
        intents: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  #publish(snapshot: WechatIntentSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
