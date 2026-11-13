import type { AiTransport } from "../../core/ai/public.ts";
import type { ChatContext } from "../../core/chat/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type {
  ModelConnectionsReader,
  WechatPreferences,
  WechatSendMode,
} from "../settings/public.ts";
import type { WechatStorage } from "./ports/wechat-storage.ts";
import {
  conversationId,
  emptyWechat,
  type WechatConversation,
  type WechatData,
  type WechatMessageContent,
  type WechatSnapshot,
} from "./wechat.ts";
import { WechatReplySession } from "./wechat-reply-session.ts";
import { readWechatRoster } from "./wechat-context.ts";
import { editWechatMessage, type WechatMessageEdit } from "./wechat-message-edit.ts";
import { WechatMemoryEditor } from "./wechat-memory-editor.ts";
import { WechatWrites } from "./wechat-writes.ts";
import { WechatSubmission } from "./wechat-submission.ts";
import { wechatMemoryBoundaries } from "./wechat-memory.ts";
import type { WechatStickerLibrary } from "./wechat-sticker-library.ts";
import { WechatMomentsService } from "./wechat-moments-service.ts";
import { WechatChatMedia } from "./wechat-chat-media.ts";

import type { ImageHub } from "../../core/image-hub/public.ts";

interface Dependencies {
  imageHub: ImageHub;
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
  readonly moments: WechatMomentsService;
  readonly media: WechatChatMedia;
  #operation = 0;
  #preparation = 0;
  #sourceKey: string;
  #sourceRevision: number;
  #characterRevision = 0;

  constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
    const chatId = dependencies.chat.getSnapshot()?.id ?? null;
    this.#snapshot = {
      chatId,
      data: chatId ? (dependencies.storage.read(chatId) ?? emptyWechat()) : emptyWechat(),
      people: [],
      scopeId: null,
      momentsScopeId: null,
      loading: false,
      error: null,
      reply: { status: "idle" },
      momentGeneration: { status: "idle" },
      chatMediaBusy: false,
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
      replyBusy: () =>
        this.#replies.busy ||
        this.moments.generation.busy ||
        this.#snapshot.barrierSaving ||
        this.#snapshot.chatMediaBusy,
      conversation: (id) => this.#conversationForSending(id),
      withConversation: (conversation) => this.#dataWithConversation(conversation),
      save: (update) => this.#writes.save(update),
      publish: (patch) => this.#publish(patch),
    });
    this.memory = new WechatMemoryEditor({
      conversation: (id) => this.#conversationForSending(id),
      busy: () => this.#chatEditBusy(),
      chatName: () => this.#dependencies.chat.getSnapshot()!.name,
      publish: (patch) => this.#publish(patch),
      save: (update) => this.#writes.save(update),
    });
    this.moments = new WechatMomentsService({
      ...dependencies,
      snapshot: this.getSnapshot,
      busy: () =>
        this.#submission.busy ||
        this.#replies.busy ||
        this.#writes.busy ||
        this.#snapshot.chatMediaBusy ||
        this.#snapshot.barrierSaving,
      save: (update, generated) => this.#writes.save(update, generated),
      publishGeneration: (momentGeneration) => this.#publish({ momentGeneration }),
    });
    this.media = new WechatChatMedia({
      ...dependencies,
      snapshot: this.getSnapshot,
      conversation: (id) => this.#conversationForSending(id),
      busy: () => this.#chatEditBusy(),
      save: (update) => this.#writes.save(update),
      publishBusy: (chatMediaBusy) => this.#publish({ chatMediaBusy }),
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
      const { chatId } = this.#snapshot;
      if (!chatId) {
        throw new Error("请先打开一个 ST 聊天");
      }
      const roster = await readWechatRoster(this.#dependencies.data);
      if (version !== this.#preparation) {
        return;
      }
      // 切换聊天时旧空间可能暂时匹配不到帐号。以校验时已保存的选择为准，按稳定身份匹配。
      const savedAccount =
        this.#snapshot.data.account ?? this.#dependencies.storage.read(chatId)?.account;
      const account =
        savedAccount &&
        savedAccount.scopeId === roster.scopeId &&
        roster.people.some((person) => person.id === savedAccount.id)
          ? savedAccount
          : null;
      if (this.#snapshot.data.account && !account) {
        this.cancel();
      }
      this.#publish({
        people: roster.people,
        scopeId: roster.scopeId,
        momentsScopeId: roster.scopeId,
        loading: false,
        data: { ...this.#snapshot.data, account },
      });
    } catch (error) {
      if (version === this.#preparation) {
        this.#publish({ loading: false, error: (error as Error).message });
      }
    }
  }

  async selectAccount(id: string): Promise<boolean> {
    if (
      this.#submission.busy ||
      this.#replies.committing ||
      this.#writes.busy ||
      this.moments.generation.committing ||
      this.#snapshot.barrierSaving
    ) {
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
    const value = text.trim();
    const sent = value
      ? await this.#submission.append(
          otherId,
          { type: "text", text: value },
          {
            onSent: options.onSent,
            draftText: options.preserveDraft ? undefined : text,
          },
        )
      : true;
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
    const value = text.trim();
    return value
      ? this.#submission.append(
          otherId,
          { type: "text", text: value },
          {
            draftText: options.preserveDraft ? undefined : text,
          },
        )
      : false;
  }

  async sendContent(
    otherId: string,
    content: Exclude<WechatMessageContent, { type: "text" }>,
    mode: WechatSendMode,
  ): Promise<boolean> {
    if (this.#chatEditBusy()) {
      throw new Error("请等待当前消息处理完成");
    }
    if (content.type !== "image" && content.status !== "pending") {
      throw new Error("新发出的红包或转账须等待接收方处理");
    }
    const operation = this.#operation;
    const conversationId = this.#conversationForSending(otherId).id;
    const sent = await this.#submission.append(otherId, content);
    if (sent && mode === "immediate" && operation === this.#operation) {
      // 保存成功即返回聊天页；如果回复启动失败，仍只重试回复，避免重发卡片。
      void this.requestReply(otherId).catch((error: Error) => {
        if (operation === this.#operation) {
          this.#publish({
            reply: { status: "error", conversationId, error: error.message, retry: true },
          });
        }
      });
    }
    return sent;
  }

  async requestReply(otherId: string): Promise<void> {
    if (this.#chatEditBusy()) {
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
      save: (next, generated) =>
        this.#writes.save(() => this.#dataWithConversation(next), generated),
    });
  }

  async editMessage(otherId: string, messageId: string, action: WechatMessageEdit): Promise<void> {
    const chatName = this.#dependencies.chat.getSnapshot()?.name;
    const labels = { recall: "撤回消息", restore: "取消撤回", delete: "删除消息" };
    try {
      if (this.#chatEditBusy()) {
        throw new Error("请等待当前消息处理完成，生成中可先停止");
      }
      const conversation = this.#conversationForSending(otherId);
      const next = editWechatMessage(
        conversation,
        this.#snapshot.data.account!.id,
        messageId,
        action,
      );
      await this.#writes.save(() => this.#dataWithConversation(next));
    } catch (error) {
      this.#publish({
        operationError: `${chatName ?? "微信"}：${labels[action]}失败，${(error as Error).message}`,
      });
    }
  }

  #chatEditBusy(): boolean {
    return (
      this.#submission.busy ||
      this.#replies.busy ||
      this.moments.generation.busy ||
      this.#snapshot.chatMediaBusy ||
      this.#writes.busy ||
      this.#snapshot.barrierSaving
    );
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

  cancel(viewChanged = false): void {
    ++this.#operation;
    this.media.cancel();
    this.moments.generation.cancel(viewChanged);
    if (!this.#submission.busy) {
      this.#replies.cancel(viewChanged);
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
    const { revision, characterRevision = 0 } = this.#dependencies.data.getSnapshot();
    if (binding !== this.#sourceKey) {
      this.#sourceKey = binding;
      this.cancel(true);
      ++this.#preparation;
      this.#publish({
        people: [],
        scopeId: null,
        momentsScopeId: this.#dependencies.data.getSnapshot().context.available
          ? null
          : this.#snapshot.momentsScopeId,
      });
    }
    if (revision !== this.#sourceRevision || characterRevision !== this.#characterRevision) {
      this.#characterRevision = characterRevision;
      this.#sourceRevision = revision;
      void this.prepare();
    }
  };
  #chatChanged = (): void => {
    const chatId = this.#dependencies.chat.getSnapshot()?.id ?? null;
    if (chatId === this.#snapshot.chatId) {
      return;
    }
    this.cancel(true);
    this.#writes.changedChat();
    ++this.#preparation;
    this.#publish({
      chatId,
      reply: { status: "idle" },
      data: chatId ? (this.#dependencies.storage.read(chatId) ?? emptyWechat()) : emptyWechat(),
      people: [],
      scopeId: null,
      momentsScopeId: null,
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
