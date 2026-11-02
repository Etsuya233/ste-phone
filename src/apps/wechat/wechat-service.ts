import type { AiTransport } from "../../core/ai/public.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import type { WechatStorage } from "./ports/wechat-storage.ts";
import {
  conversationId,
  createWechatMessage,
  emptyWechat,
  type WechatConversation,
  type WechatData,
  type WechatSnapshot,
} from "./wechat.ts";
import { createWechatReplies } from "./wechat-reply.ts";
import { readWechatRoster } from "./wechat-context.ts";

interface Dependencies {
  storage: WechatStorage;
  chat: ChatContext;
  data: DataAppPublic;
  connections: ModelConnectionsReader;
  transport: AiTransport;
}
interface ReplyTask {
  controller: AbortController;
  chatId: string;
}

/** 消息以人物身份持久化，帐号切换仅改变阅读与操作视角。 */
export class WechatService {
  readonly #dependencies: Dependencies;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: (() => void)[];
  readonly #drafts = new Map<string, string>();
  #snapshot: WechatSnapshot;
  #task: ReplyTask | null = null;
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
    };
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
    this.cancel();
    const person = this.#snapshot.people.find((person) => person.id === id);
    if (!person || !this.#snapshot.scopeId) {
      throw new Error("请选择当前资料中的人物");
    }
    try {
      await this.#save({
        ...this.#snapshot.data,
        account: { id, name: person.name, scopeId: this.#snapshot.scopeId },
      });
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

  async send(otherId: string, text: string, onSent?: () => void): Promise<boolean> {
    if (this.#task) {
      throw new Error("请等待当前回复完成");
    }
    const value = text.trim();
    if (!value) {
      return false;
    }
    const conversation = this.#newConversation(otherId);
    const created = !this.getConversation(otherId);
    const message = createWechatMessage(this.#snapshot.data.account!.id, {
      type: "text",
      text: value,
    });
    const next = { ...conversation, messages: [...conversation.messages, message] };
    const task = this.#startTask();
    this.setDraft(otherId, "");
    // 整份聊天保存需要一次 HTTP 往返，先把这条消息放进快照，避免保存期间只看到回复状态。
    this.#publish({
      data: this.#dataWithConversation(next),
      reply: { status: "sending", conversationId: conversation.id },
    });
    try {
      try {
        await this.#saveConversation(next);
      } catch (error) {
        this.setDraft(otherId, text);
        if (this.#snapshot.chatId === task.chatId) {
          this.#dropOptimisticMessage(conversation.id, message.id, created);
        }
        if (this.#owns(task)) {
          this.#failReply(conversation.id, error, false);
        }
        return false;
      }
      onSent?.();
      if (!this.#owns(task)) {
        return true;
      }
      this.#publish({ reply: { status: "running", conversationId: conversation.id } });
      try {
        await this.#reply(next, task);
      } catch (error) {
        if (this.#owns(task)) {
          this.#failReply(conversation.id, error, true);
        }
      }
      return true;
    } finally {
      if (this.#task === task) {
        this.#task = null;
      }
    }
  }

  async retry(otherId: string): Promise<void> {
    const conversation = this.getConversation(otherId);
    if (!conversation || this.#task) {
      throw new Error("当前没有可重试的回复");
    }
    const task = this.#startTask();
    this.#publish({ reply: { status: "running", conversationId: conversation.id } });
    try {
      await this.#reply(conversation, task);
    } catch (error) {
      if (this.#owns(task)) {
        this.#failReply(conversation.id, error, true);
      }
    } finally {
      if (this.#task === task) {
        this.#task = null;
      }
    }
  }

  #failReply(conversationId: string, error: unknown, retry: boolean): void {
    this.#publish({
      reply: {
        status: "error",
        conversationId,
        error: (error as Error).message,
        retry,
      },
    });
  }

  #newConversation(otherId: string): WechatConversation {
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
  #startTask(): ReplyTask {
    const chatId = this.#snapshot.chatId;
    if (!chatId) {
      throw new Error("请先打开一个 ST 聊天");
    }
    const task = { chatId, controller: new AbortController() };
    this.#task = task;
    return task;
  }

  async #reply(conversation: WechatConversation, task: ReplyTask): Promise<void> {
    const { data, connections, transport } = this.#dependencies;
    const account = this.#snapshot.data.account!;
    const sender = this.#snapshot.people.find((person) => person.id === account.id);
    const recipient = this.#snapshot.people.find((person) =>
      conversation.people.some((member) => member.id === person.id && member.id !== account.id),
    );
    if (!sender || !recipient || this.#snapshot.error) {
      throw new Error("当前帐号或对方人物资料不可用");
    }
    const messages = await createWechatReplies({
      data,
      connections,
      transport,
      sender,
      recipient,
      conversation,
      signal: task.controller.signal,
    });
    if (!this.#owns(task)) {
      return;
    }
    // 完整校验后一次保存；失败提示错误，首期不保存跨会话待提交任务。
    try {
      await this.#saveConversation({
        ...conversation,
        messages: [...conversation.messages, ...messages],
      });
    } catch (error) {
      if (this.#owns(task)) {
        this.#publish({
          reply: {
            status: "error",
            conversationId: conversation.id,
            error: `回复保存失败：${(error as Error).message}`,
            retry: false,
          },
        });
      }
      return;
    }
    if (this.#owns(task)) {
      this.#publish({ reply: { status: "idle" } });
    }
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

  /** 保存失败时只撤回这条本地先显示的消息，保留期间发生的其他资料变化。 */
  #dropOptimisticMessage(conversationId: string, messageId: string, created: boolean): void {
    const { data } = this.#snapshot;
    const current = data.conversations.find((item) => item.id === conversationId);
    if (!current?.messages.some((message) => message.id === messageId)) {
      return;
    }
    const messages = current.messages.filter((message) => message.id !== messageId);
    const conversations =
      created && messages.length === 0
        ? data.conversations.filter((item) => item.id !== conversationId)
        : data.conversations.map((item) =>
            item.id === conversationId ? { ...current, messages } : item,
          );
    this.#publish({ data: { ...data, conversations } });
  }

  async #saveConversation(conversation: WechatConversation): Promise<void> {
    await this.#save(this.#dataWithConversation(conversation));
  }
  async #save(value: WechatData): Promise<void> {
    const chatId = this.#snapshot.chatId;
    if (!chatId) {
      throw new Error("请先打开一个 ST 聊天");
    }
    await this.#dependencies.storage.write(chatId, value);
    if (this.#snapshot.chatId === chatId) {
      this.#publish({ data: value, error: null });
    }
  }
  cancel(): void {
    this.#task?.controller.abort();
    this.#task = null;
    this.#publish({ reply: { status: "idle" } });
  }
  dispose(): void {
    this.cancel();
    for (const unsubscribe of this.#unsubscribe) {
      unsubscribe();
    }
  }
  #owns(task: ReplyTask): boolean {
    return (
      this.#task === task &&
      !task.controller.signal.aborted &&
      this.#snapshot.chatId === task.chatId
    );
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
