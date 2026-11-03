import type { AiTransport } from "../../core/ai/public.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type { WechatPreferences } from "../settings/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import type { WechatStorage } from "./ports/wechat-storage.ts";
import {
  conversationId,
  emptyWechat,
  type WechatConversation,
  type WechatData,
  type WechatSnapshot,
} from "./wechat.ts";
import { WechatReplySession } from "./wechat-reply-session.ts";
import { readWechatRoster } from "./wechat-context.ts";
import { WechatMemoryEditor } from "./wechat-memory-editor.ts";
import { WechatWrites } from "./wechat-writes.ts";
import { WechatSubmission } from "./wechat-submission.ts";
import { wechatMemoryBoundaries } from "./wechat-memory.ts";
import type { WechatStickerLibrary } from "./wechat-sticker-library.ts";

interface Dependencies {
  storage: WechatStorage;
  preferences: WechatPreferences;
  chat: ChatContext;
  data: DataAppPublic;
  connections: ModelConnectionsReader;
  transport: AiTransport;
  stickers: WechatStickerLibrary;
}

/** 消息以人物身份持久化，帐号切换仅改变阅读与操作视角。 */
export class WechatService {
  readonly #dependencies: Dependencies;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: (() => void)[];
  #snapshot: WechatSnapshot;
  readonly #replies: WechatReplySession;
  readonly #submission: WechatSubmission;
  readonly #writes: WechatWrites;
  readonly memory: WechatMemoryEditor;
  #operation = 0;
  #preparation = 0;
  #sourceKey: string;
  #sourceRevision: number;

  constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
    const chatId = dependencies.chat.getSnapshot()?.id ?? null;
    this.#snapshot = {
      chatId,
      data: chatId ? (dependencies.storage.read(chatId) ?? emptyWechat()) : emptyWechat(),
      people: [],
      scopeId: null,
      loading: false,
      error: null,
      reply: { status: "idle" },
      writeBusy: false,
      barrierSaving: false,
      operationError: null,
    };
    this.#replies = new WechatReplySession({
      ...dependencies,
      publish: (reply) => this.#publish({ reply }),
    });
    this.#writes = new WechatWrites(dependencies.storage, this.getSnapshot, (patch) =>
      this.#publish(patch),
    );
    this.#submission = new WechatSubmission({
      snapshot: this.getSnapshot,
      operation: () => this.#operation,
      generation: () => this.#writes.generation,
      replyBusy: () => this.#replies.busy || this.#snapshot.barrierSaving,
      conversation: (id) => this.#conversationForSending(id),
      withConversation: (conversation) => this.#dataWithConversation(conversation),
      save: (update) => this.#writes.save(update),
      publish: (patch) => this.#publish(patch),
    });
    this.memory = new WechatMemoryEditor({
      conversation: (id) => this.#conversationForSending(id),
      busy: () =>
        this.#submission.busy ||
        this.#replies.busy ||
        this.#writes.busy ||
        this.#snapshot.barrierSaving,
      chatName: () => this.#dependencies.chat.getSnapshot()!.name,
      publish: (patch) => this.#publish(patch),
      save: (update) => this.#writes.save(update),
    });
    this.#sourceKey = this.#binding();
    this.#sourceRevision = dependencies.data.getSnapshot().revision;
    this.#unsubscribe = [
      dependencies.chat.subscribe(this.#chatChanged),
      dependencies.data.subscribe(this.#sourceChanged),
    ];
  }
  getSnapshot = () => this.#snapshot;
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  async prepare(): Promise<void> {
    const version = ++this.#preparation;
    this.#publish({ loading: true, error: null });
    try {
      if (!this.#snapshot.chatId) {
        throw new Error("请先打开一个 ST 聊天");
      }
      const roster = await readWechatRoster(this.#dependencies.data, this.#snapshot.data.account);
      if (version !== this.#preparation) {
        return;
      }
      if (this.#snapshot.data.account && !roster.account) {
        this.cancel();
      }
      this.#publish({
        people: roster.people,
        scopeId: roster.scopeId,
        loading: false,
        data: { ...this.#snapshot.data, account: roster.account },
      });
    } catch (error) {
      if (version === this.#preparation) {
        this.#publish({ loading: false, error: (error as Error).message });
      }
    }
  }

  async selectAccount(id: string): Promise<boolean> {
    if (this.#submission.busy || this.#replies.committing || this.#snapshot.barrierSaving) {
      throw new Error("请等待消息保存完成");
    }
    this.cancel();
    const person = this.#snapshot.people.find((person) => person.id === id);
    if (!person || !this.#snapshot.scopeId) {
      throw new Error("请选择当前资料中的人物");
    }
    const scopeId = this.#snapshot.scopeId;
    try {
      await this.#writes.save((data) => ({
        ...data,
        account: { id, name: person.name, scopeId },
      }));
      return true;
    } catch (error) {
      this.#publish({ error: (error as Error).message });
      return false;
    }
  }

  getConversation(otherId: string): WechatConversation | undefined {
    const { account } = this.#snapshot.data;
    return account
      ? this.#snapshot.data.conversations.find(
          (item) => item.id === conversationId(account.scopeId, account.id, otherId),
        )
      : undefined;
  }
  async saveReplyGuidance(id: string, text: string): Promise<void> {
    if (this.#submission.busy || this.#snapshot.barrierSaving) {
      throw new Error("请等待消息保存完成后再保存回复指导");
    }
    const { scopeId, people } = this.#snapshot;
    if (!scopeId || !people.some((person) => person.id === id)) {
      throw new Error("当前人物资料不可用，无法保存回复指导");
    }
    const guidance = text.trim();
    await this.#writes.save((data) => {
      const peopleGuidance = { ...data.replyGuidance?.[scopeId] };
      if (guidance) {
        peopleGuidance[id] = guidance;
      } else {
        delete peopleGuidance[id];
      }
      return { ...data, replyGuidance: { ...data.replyGuidance, [scopeId]: peopleGuidance } };
    });
  }
  dismissOperationError = () => this.#publish({ operationError: null });
  getDraft = (otherId: string) => this.#submission.getDraft(otherId);
  setDraft = (otherId: string, value: string) => this.#submission.setDraft(otherId, value);

  /** 发送始终触发回复；空输入不创建用户消息，可让对方主动开口。 */
  async send(
    otherId: string,
    text: string,
    options: { onSent?: () => void; preserveDraft?: boolean } = {},
  ): Promise<boolean> {
    const operation = this.#operation;
    const sent = text.trim() ? await this.#submission.append(otherId, text, options) : true;
    if (sent && operation === this.#operation) {
      await this.requestReply(otherId);
    }
    return sent;
  }

  /** 延迟模式逐条加入队列，已经保存的消息在触发回复前保持可见。 */
  async enqueue(
    otherId: string,
    text: string,
    options: { preserveDraft?: boolean } = {},
  ): Promise<boolean> {
    if (this.#dependencies.preferences.getSnapshot() !== "delayed") {
      throw new Error("请切换为延迟发送后加入消息队列");
    }
    return this.#submission.append(otherId, text, options);
  }

  async requestReply(otherId: string): Promise<void> {
    if (this.#submission.busy || this.#replies.busy || this.#snapshot.barrierSaving) {
      throw new Error("请等待当前消息处理完成");
    }
    const conversation = this.#conversationForSending(otherId);
    const account = this.#snapshot.data.account!;
    const sender = this.#snapshot.people.find((person) => person.id === account.id)!;
    const recipient = this.#snapshot.people.find((person) => person.id === otherId)!;
    await this.#replies.generateAndSave({
      conversation,
      sender,
      recipient,
      // 在取材前固定本轮指导；生成期间保存的新内容只影响下一轮。
      historyMessageLimit: this.#dependencies.preferences.getHistoryMessageLimit(),
      replyGuidance: this.#snapshot.data.replyGuidance?.[account.scopeId]?.[otherId] ?? "",
      save: (next, signal) => this.#writes.save(() => this.#dataWithConversation(next), signal),
    });
  }

  #conversationForSending(otherId: string): WechatConversation {
    const { account } = this.#snapshot.data;
    const other = this.#snapshot.people.find((person) => person.id === otherId);
    if (
      !account ||
      account.scopeId !== this.#snapshot.scopeId ||
      !other ||
      other.id === account.id ||
      this.#snapshot.error
    ) {
      throw new Error("当前帐号或对方人物资料不可用");
    }
    const conversation = this.getConversation(otherId) ?? {
      id: conversationId(account.scopeId, account.id, otherId),
      people: [account, { id: other.id, name: other.name, scopeId: account.scopeId }],
      messages: [],
    };
    wechatMemoryBoundaries(conversation);
    return conversation;
  }
  #dataWithConversation(conversation: WechatConversation): WechatData {
    const { data } = this.#snapshot;
    return {
      ...data,
      conversations: [
        ...data.conversations.filter((item) => item.id !== conversation.id),
        conversation,
      ],
    };
  }

  cancel(): void {
    ++this.#operation;
    if (!this.#submission.busy) {
      this.#replies.cancel();
    }
  }
  dispose(): void {
    this.cancel();
    for (const unsubscribe of this.#unsubscribe) {
      unsubscribe();
    }
  }
  #binding(): string {
    const context = this.#dependencies.data.getSnapshot().context;
    return JSON.stringify([context.chatIdentity, context.scopeId]);
  }
  #sourceChanged = (): void => {
    const binding = this.#binding();
    const revision = this.#dependencies.data.getSnapshot().revision;
    if (binding !== this.#sourceKey) {
      this.#sourceKey = binding;
      this.cancel();
      ++this.#preparation;
      this.#publish({ people: [], scopeId: null });
    }
    if (revision !== this.#sourceRevision) {
      this.#sourceRevision = revision;
      void this.prepare();
    }
  };
  #chatChanged = (): void => {
    const chatId = this.#dependencies.chat.getSnapshot()?.id ?? null;
    if (chatId === this.#snapshot.chatId) {
      return;
    }
    this.cancel();
    this.#writes.changedChat();
    ++this.#preparation;
    this.#publish({
      chatId,
      data: chatId ? (this.#dependencies.storage.read(chatId) ?? emptyWechat()) : emptyWechat(),
      people: [],
      scopeId: null,
      error: null,
    });
  };
  #publish(patch: Partial<WechatSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
