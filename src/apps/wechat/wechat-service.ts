import type { AiTransport } from "../../core/ai/public.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type { WechatPreferences } from "../settings/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import type { WechatStorage } from "./ports/wechat-storage.ts";
import {
  conversationId,
  createWechatMessage,
  emptyWechat,
  type WechatConversation,
  type WechatData,
  type WechatSnapshot,
  appendWechatMessage,
  rollbackWechatMessage,
} from "./wechat.ts";
import { WechatReplySession } from "./wechat-reply-session.ts";
import { readWechatRoster } from "./wechat-context.ts";
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
  readonly #drafts = new Map<string, string>();
  #snapshot: WechatSnapshot;
  readonly #replies: WechatReplySession;
  #sending = false;
  #operation = 0;
  #preparation = 0;
  #sourceKey: string;
  #sourceRevision: number;
  #writes: Promise<void> = Promise.resolve();

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
    };
    this.#replies = new WechatReplySession({
      ...dependencies,
      publish: (reply) => this.#publish({ reply }),
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
    if (this.#sending || this.#replies.committing) {
      throw new Error("请等待消息保存完成");
    }
    this.cancel();
    const person = this.#snapshot.people.find((person) => person.id === id);
    if (!person || !this.#snapshot.scopeId) {
      throw new Error("请选择当前资料中的人物");
    }
    const scopeId = this.#snapshot.scopeId;
    try {
      await this.#save((data) => ({
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
    if (this.#sending) {
      throw new Error("请等待消息保存完成后再保存回复指导");
    }
    const { scopeId, people } = this.#snapshot;
    if (!scopeId || !people.some((person) => person.id === id)) {
      throw new Error("当前人物资料不可用，无法保存回复指导");
    }
    const guidance = text.trim();
    await this.#save((data) => {
      const peopleGuidance = { ...data.replyGuidance?.[scopeId] };
      if (guidance) {
        peopleGuidance[id] = guidance;
      } else {
        delete peopleGuidance[id];
      }
      return { ...data, replyGuidance: { ...data.replyGuidance, [scopeId]: peopleGuidance } };
    });
  }
  getDraft(otherId: string): string {
    return this.#drafts.get(this.#draftKey(otherId)) ?? "";
  }
  setDraft(otherId: string, value: string): void {
    this.#drafts.set(this.#draftKey(otherId), value);
  }
  #draftKey(otherId: string): string {
    const { chatId, scopeId, data } = this.#snapshot;
    return JSON.stringify([chatId, scopeId, data.account?.id, otherId]);
  }

  /** 发送始终触发回复；空输入不创建用户消息，可让对方主动开口。 */
  async send(
    otherId: string,
    text: string,
    options: { onSent?: () => void; preserveDraft?: boolean } = {},
  ): Promise<boolean> {
    const operation = this.#operation;
    const sent = text.trim() ? await this.#appendMessage(otherId, text, options) : true;
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
    return this.#appendMessage(otherId, text, options);
  }

  /** 消息先显示再持久化；失败撤回本条消息，保留原会话和新草稿。 */
  async #appendMessage(
    otherId: string,
    text: string,
    options: { onSent?: () => void; preserveDraft?: boolean } = {},
  ): Promise<boolean> {
    if (this.#sending || this.#replies.busy) {
      throw new Error("请等待当前消息处理完成");
    }
    const value = text.trim();
    if (!value) {
      return false;
    }
    const conversation = this.#conversationForSending(otherId);
    const message = createWechatMessage(this.#snapshot.data.account!.id, {
      type: "text",
      text: value,
    });
    const next = appendWechatMessage(conversation, message);
    const operation = this.#operation;
    const chatId = this.#snapshot.chatId;
    const draftKey = this.#draftKey(otherId);
    this.#sending = true;
    if (!options.preserveDraft) {
      this.setDraft(otherId, "");
    }
    this.#publish({
      data: this.#dataWithConversation(next),
      reply: { status: "sending", conversationId: conversation.id },
    });
    try {
      await this.#save(() => this.#dataWithConversation(next));
      if (operation === this.#operation) {
        this.#publish({ reply: { status: "idle" } });
        options.onSent?.();
      }
      return true;
    } catch (error) {
      // 保存拥有发起时的草稿归属；切聊天或退出应用不能让失败正文丢失。
      if (!options.preserveDraft && !this.#drafts.get(draftKey)) {
        this.#drafts.set(draftKey, text);
      }
      if (
        this.#snapshot.chatId === chatId &&
        this.#snapshot.data.account?.id === message.senderId
      ) {
        const current = this.getConversation(otherId);
        if (current?.messages.some((item) => item.id === message.id)) {
          this.#publish({
            data: rollbackWechatMessage(this.#snapshot.data, conversation, message.id),
          });
        }
        this.#publish({
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
      this.#sending = false;
      if (this.#snapshot.reply.status === "sending") {
        this.#publish({ reply: { status: "idle" } });
      }
    }
  }

  async requestReply(otherId: string): Promise<void> {
    if (this.#sending || this.#replies.busy) {
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
      replyGuidance: this.#snapshot.data.replyGuidance?.[account.scopeId]?.[otherId] ?? "",
      save: (next, signal) => this.#save(() => this.#dataWithConversation(next), signal),
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
    return (
      this.getConversation(otherId) ?? {
        id: conversationId(account.scopeId, account.id, otherId),
        people: [account, { id: other.id, name: other.name, scopeId: account.scopeId }],
        messages: [],
      }
    );
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

  async #save(update: (data: WechatData) => WechatData, signal?: AbortSignal): Promise<void> {
    const chatId = this.#snapshot.chatId;
    if (!chatId) {
      throw new Error("请先打开一个 ST 聊天");
    }
    const operation = this.#operation;
    // 指导编辑与消息共用聊天快照，依次提交并在执行时合并最新数据，避免互相覆盖。
    const writing = this.#writes.then(async () => {
      signal?.throwIfAborted();
      if (this.#snapshot.chatId !== chatId) {
        throw new Error("当前聊天已变化，无法保存微信");
      }
      const value = update(this.#snapshot.data);
      await this.#dependencies.storage.write(chatId, value, signal);
      signal?.throwIfAborted();
      if (this.#snapshot.chatId === chatId) {
        const account = operation === this.#operation ? value.account : this.#snapshot.data.account;
        this.#publish({ data: { ...value, account }, error: null });
      }
    });
    // 单次失败交还调用页面展示；后续明确发起的保存仍可继续。
    this.#writes = writing.catch(() => {});
    await writing;
  }
  cancel(): void {
    ++this.#operation;
    if (!this.#sending) {
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
