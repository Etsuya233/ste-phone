import type { ChatContext } from "../../core/chat/public.ts";
import type { AppIntentSource } from "../../core/phone-context/public.ts";
import type { PhoneContextStorage } from "./ports/context-storage.ts";
import type { PhoneContextData, PhoneContextPreset, PhoneContextSnapshot } from "./public.ts";
import { validateContextData, validateContextPreset } from "./context-validation.ts";

export class PhoneContextService {
  readonly #chat: ChatContext;
  readonly #storage: PhoneContextStorage;
  readonly #sources: readonly AppIntentSource[];
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: () => void;
  #snapshot: PhoneContextSnapshot = { chatId: null, presets: [], saving: false, error: null };
  #generation = 0;

  constructor(dependencies: {
    chat: ChatContext;
    storage: PhoneContextStorage;
    sources: readonly AppIntentSource[];
  }) {
    this.#chat = dependencies.chat;
    this.#storage = dependencies.storage;
    this.#sources = dependencies.sources;
    if (new Set(this.#sources.map(({ id }) => id)).size !== this.#sources.length) {
      throw new Error("App Intent 来源 ID 重复");
    }
    this.#unsubscribe = this.#chat.subscribe(this.#chatChanged);
    this.#refresh();
  }

  getSnapshot = (): PhoneContextSnapshot => this.#snapshot;
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

  listSources() {
    return this.#sources.map(({ id, label }) => ({ id, label }));
  }

  listIntents(sourceId: string) {
    return this.#source(sourceId).listIntents(this.#chatId());
  }

  preview(preset: PhoneContextPreset): string {
    validateContextPreset(preset);
    return this.#source(preset.sourceId).readIntent({
      chatId: this.#chatId(),
      intentId: preset.intentId,
      now: Date.now(),
    });
  }

  /** 每次展开重新读取已保存预设与 App 数据，预览、渲染和 token 计算不消费消息。 */
  expand(id: string): string {
    const data = this.#read(this.#chatId());
    const preset = data.presets.find((item) => item.id === id);
    if (!preset) {
      throw new Error(`ST 宏绑定不存在：${id}`);
    }
    return this.preview(preset);
  }

  async save(preset: PhoneContextPreset): Promise<void> {
    validateContextPreset(preset);
    if (!this.listIntents(preset.sourceId).some(({ id }) => id === preset.intentId)) {
      throw new Error("引用的 App Intent 已不存在，请重新选择");
    }
    const value = structuredClone(preset);
    await this.#write((data) => ({
      version: 2,
      presets: [...data.presets.filter((item) => item.id !== value.id), value],
    }));
  }

  async remove(id: string): Promise<void> {
    await this.#write((data) => {
      if (!data.presets.some((preset) => preset.id === id)) {
        throw new Error(`ST 宏绑定不存在：${id}`);
      }
      return { version: 2, presets: data.presets.filter((preset) => preset.id !== id) };
    });
  }

  async #write(update: (data: PhoneContextData) => PhoneContextData): Promise<void> {
    if (this.#snapshot.saving) {
      throw new Error("ST 宏绑定正在保存");
    }
    const chatId = this.#chatId();
    const generation = this.#generation;
    const data = update(this.#read(chatId));
    this.#publish({ ...this.#snapshot, saving: true, error: null });
    try {
      await this.#storage.write(chatId, data);
      // 保存属于发起聊天；切走再切回时重新读取当前元数据，不发布旧快照。
      this.#refresh();
    } catch (error) {
      if (generation === this.#generation) {
        this.#publish({
          ...this.#snapshot,
          error: String(error instanceof Error ? error.message : error),
        });
      }
      throw error;
    } finally {
      this.#publish({ ...this.#snapshot, saving: false });
    }
  }

  #source(id: string): AppIntentSource {
    const source = this.#sources.find((item) => item.id === id);
    if (!source) {
      throw new Error(`App Intent 来源不可用：${id}`);
    }
    return source;
  }

  #chatId(): string {
    const chatId = this.#chat.getSnapshot()?.id;
    if (!chatId) {
      throw new Error("请先打开一个 ST 聊天");
    }
    return chatId;
  }

  #read(chatId: string): PhoneContextData {
    const data = this.#storage.read(chatId) ?? { version: 2, presets: [] };
    validateContextData(data);
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
      const presets = chatId ? this.#read(chatId).presets : [];
      this.#publish({ ...this.#snapshot, chatId, presets, error: null });
    } catch (error) {
      this.#publish({
        ...this.#snapshot,
        chatId,
        presets: [],
        error: String(error instanceof Error ? error.message : error),
      });
    }
  }

  #publish(snapshot: PhoneContextSnapshot): void {
    this.#snapshot = snapshot;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
