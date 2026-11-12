import type { ChatContext } from "../../core/chat/public.ts";
import type { ContextSource } from "../../core/phone-context/public.ts";
import type { PhoneContextStorage } from "./ports/context-storage.ts";
import type { PhoneContextData, PhoneContextPreset, PhoneContextSnapshot } from "./public.ts";
import { validateContextData, validateContextPreset } from "./context-validation.ts";

export class PhoneContextService {
  readonly #chat: ChatContext;
  readonly #storage: PhoneContextStorage;
  readonly #sources: readonly ContextSource[];
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: () => void;
  #snapshot: PhoneContextSnapshot = { chatId: null, presets: [], saving: false, error: null };
  #generation = 0;

  constructor(dependencies: {
    chat: ChatContext;
    storage: PhoneContextStorage;
    sources: readonly ContextSource[];
  }) {
    this.#chat = dependencies.chat;
    this.#storage = dependencies.storage;
    this.#sources = dependencies.sources;
    if (new Set(this.#sources.map(({ id }) => id)).size !== this.#sources.length) {
      throw new Error("手机上下文来源 ID 重复");
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
    return this.#sources.map(({ id, label, minimumPeople }) => ({ id, label, minimumPeople }));
  }

  listScopes(sourceId: string) {
    return this.#source(sourceId).listScopes(this.#chatId());
  }

  preview(preset: PhoneContextPreset) {
    validateContextPreset(preset);
    return this.#source(preset.sourceId).read({
      chatId: this.#chatId(),
      selection: preset.selection,
      now: Date.now(),
    });
  }

  /** 每次展开重新读取已保存预设与 App 数据，预览、渲染和 token 计算不消费消息。 */
  expand(id: string): string {
    const data = this.#read(this.#chatId());
    const preset = data.presets.find((item) => item.id === id);
    if (!preset) {
      throw new Error(`手机上下文预设不存在：${id}`);
    }
    return this.preview(preset).text;
  }

  async save(preset: PhoneContextPreset): Promise<void> {
    validateContextPreset(preset);
    this.#source(preset.sourceId).validateSelection(preset.selection);
    const value = structuredClone(preset);
    await this.#write((data) => ({
      version: 1,
      presets: [...data.presets.filter((item) => item.id !== value.id), value],
    }));
  }

  async remove(id: string): Promise<void> {
    await this.#write((data) => {
      if (!data.presets.some((preset) => preset.id === id)) {
        throw new Error(`手机上下文预设不存在：${id}`);
      }
      return { version: 1, presets: data.presets.filter((preset) => preset.id !== id) };
    });
  }

  async #write(update: (data: PhoneContextData) => PhoneContextData): Promise<void> {
    if (this.#snapshot.saving) {
      throw new Error("手机上下文正在保存");
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

  #source(id: string): ContextSource {
    const source = this.#sources.find((item) => item.id === id);
    if (!source) {
      throw new Error(`手机上下文来源不可用：${id}`);
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
    const data = this.#storage.read(chatId) ?? { version: 1, presets: [] };
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
