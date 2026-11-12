import type { ChatContext } from "../../core/chat/public.ts";
import {
  effectiveBackground,
  effectiveCharacter,
  readSourceCharacters,
} from "./character-profiles.ts";
import {
  characterSpaceOverrides,
  readCharacterOverrides,
  updateCharacterOverrides,
  type CharacterChanges,
} from "./character-overrides.ts";
import type { CharacterOverrideStorage } from "./ports/character-override-storage.ts";
import { readStorySummary } from "./story-summary.ts";
import { readRelatedBackground } from "./read-related-background.ts";
import type { RelatedBackgroundRequest } from "./related-background.ts";
import { readWorldState } from "./world-state.ts";
import type { DatabaseProvider } from "./ports/database-provider.ts";
import { BackgroundDataSource } from "./data-source.ts";
import { QueryBackgroundProvider } from "./query-background-provider.ts";
import type { DatabaseSchema } from "./database.ts";
import type {
  DataAppPublic,
  DataScope,
  DataQuery,
  BackgroundRead,
  DataSourceSnapshot,
} from "./public.ts";
const binding = (scope: DataScope) => JSON.stringify([scope.chatIdentity, scope.scopeId]);

/** Owns external query structures and caches independently of every editor session. */
export class PhoneDataService implements DataAppPublic {
  readonly #provider: DatabaseProvider;
  readonly #background: BackgroundDataSource;
  readonly #listeners = new Set<() => void>();
  readonly #unsubscribe: (() => void)[];
  #snapshot: DataSourceSnapshot;
  readonly #characterStorage: CharacterOverrideStorage;
  readonly #savingChats = new Set<string>();
  readonly #chat: ChatContext;
  #characterRevision = 0;
  #hostGeneration = 0;
  #lastHostChatId: string | null;
  readonly #matchesMemoryChat: (memoryChatIdentity: string | null) => boolean;
  #schema: DatabaseSchema | null = null;
  #dirty = true;
  #generation = 0;
  #revision = 0;
  #pending: Promise<DatabaseSchema> | undefined;
  constructor(
    provider: DatabaseProvider,
    characterStorage: CharacterOverrideStorage,
    chat: ChatContext,
    matchesMemoryChat: (memoryChatIdentity: string | null) => boolean,
  ) {
    this.#matchesMemoryChat = matchesMemoryChat;
    this.#chat = chat;
    this.#lastHostChatId = chat.getSnapshot()?.id ?? null;
    this.#characterStorage = characterStorage;
    this.#provider = provider;
    // Register invalidation before the background cache so subscribers receive one coherent revision.
    const unsubscribeProvider = provider.subscribe(this.#sourceChanged);
    this.#background = new BackgroundDataSource(new QueryBackgroundProvider(this, provider));
    this.#snapshot = Object.freeze({
      ...this.#background.getState(),
      context: Object.freeze({ ...provider.getContext() }),
      revision: 0,
      characterRevision: 0,
      hostChatId: chat.getSnapshot()?.id ?? null,
      sourceId: null,
    });
    this.#unsubscribe = [
      unsubscribeProvider,
      this.#background.subscribe(() => this.#publish()),
      chat.subscribe(this.#hostChanged),
    ];
  }

  getSnapshot = (): DataSourceSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  async readBackground(request: BackgroundRead) {
    request = { ...request };
    this.#assertScope(request);
    const hostChatId = this.#characterChat();
    const hostGeneration = this.#hostGeneration;
    const overrides = this.#readOverrides(hostChatId);
    const result = await this.#background.load({ force: request.force });
    this.#assertScope(request);
    this.#assertHostChat(hostChatId, hostGeneration);
    return effectiveBackground(result, overrides);
  }
  async readCharacters(request: DataScope, ids?: readonly string[]) {
    const scope = { ...request };
    this.#assertScope(scope);
    const hostChatId = this.#characterChat();
    const hostGeneration = this.#hostGeneration;
    const overrideSnapshot = this.#readOverrides(hostChatId);
    const schema = await this.describe(scope);
    const characters = await readSourceCharacters(
      this,
      scope,
      ids && {
        column: "stable_record_id",
        ids: [...ids],
      },
    );
    const overrides = characterSpaceOverrides(overrideSnapshot, schema.stableScopeId);
    this.#assertHostChat(hostChatId, hostGeneration);
    return Object.freeze(characters.map((character) => effectiveCharacter(character, overrides)));
  }
  async saveCharacter(
    request: DataScope,
    hostChatId: string | null,
    id: string,
    changes: CharacterChanges,
  ): Promise<void> {
    const scope = { ...request };
    if (!hostChatId) {
      throw new Error("当前没有可保存人物资料的聊天");
    }
    if (this.#savingChats.has(hostChatId)) {
      throw new Error("人物资料正在保存");
    }
    const submittedChanges = structuredClone(changes);
    this.#assertScope(scope);
    this.#assertHostChat(hostChatId);
    const generation = this.#generation;
    const hostGeneration = this.#hostGeneration;
    this.#savingChats.add(hostChatId);
    try {
      const schema = await this.describe(scope);
      const revision = this.#revision;
      const people = await readSourceCharacters(this, scope, {
        column: "stable_record_id",
        ids: [id],
      });
      if (!people.length) {
        throw new Error("人物已不在当前资料范围内");
      }
      const assertCurrent = () => {
        this.#assertScope(scope, generation);
        this.#assertHostChat(hostChatId, hostGeneration);
        if (revision !== this.#revision) {
          throw new Error("资料已更新，请重新保存");
        }
      };
      assertCurrent();
      const saved = updateCharacterOverrides(
        this.#readOverrides(hostChatId),
        schema.stableScopeId,
        id,
        submittedChanges,
      );
      await this.#characterStorage.write(hostChatId, saved, assertCurrent);
      if (
        this.#chat.getSnapshot()?.id === hostChatId &&
        binding(this.#provider.getContext()) === binding(scope)
      ) {
        this.#characterRevision++;
        this.#publish();
      }
    } finally {
      this.#savingChats.delete(hostChatId);
    }
  }
  readSummary(request: DataScope): Promise<string> {
    return readStorySummary(this, { ...request });
  }
  async readRelatedBackground(request: RelatedBackgroundRequest) {
    request = { ...request, participantIds: [...request.participantIds] };
    this.#assertScope(request);
    const hostChatId = this.#characterChat();
    const hostGeneration = this.#hostGeneration;
    const overrideSnapshot = this.#readOverrides(hostChatId);
    const schema = await this.describe(request);
    const overrides = characterSpaceOverrides(overrideSnapshot, schema.stableScopeId);
    const result = await readRelatedBackground(this, request, overrides);
    this.#assertHostChat(hostChatId, hostGeneration);
    return result;
  }
  readWorldState(request: DataScope) {
    return readWorldState(this, { ...request });
  }
  async readRecentChat(request: DataScope & { readonly count: number }) {
    request = { ...request };
    this.#assertScope(request);
    if (!Number.isSafeInteger(request.count) || request.count <= 0) {
      throw new Error("最近聊天条数须为正整数");
    }
    if (!this.#provider.readRecentChat) {
      throw new Error("资料来源缺少清洗聊天读取能力，请更新 STE Memory");
    }
    const generation = this.#generation;
    const result = await this.#provider.readRecentChat(request.count);
    this.#assertScope(request, generation);
    if (result.chatIdentity !== request.chatIdentity) {
      throw new Error("资料来源返回了其他聊天的消息");
    }
    return Object.freeze({
      chatIdentity: result.chatIdentity,
      cleaning: Object.freeze({ ...result.cleaning }),
      messages: Object.freeze(result.messages.map((message) => Object.freeze({ ...message }))),
    });
  }
  async describe(
    request: DataScope,
    options: { readonly force?: boolean } = {},
  ): Promise<DatabaseSchema> {
    request = { ...request };
    this.#assertScope(request);
    if (!this.#provider.getContext().available) {
      throw new Error(this.#provider.getContext().message ?? "数据源不可用");
    }
    if (this.#pending) {
      return this.#pending;
    }
    if (!options.force && !this.#dirty && this.#schema) {
      return this.#schema;
    }
    const generation = this.#generation;
    const revision = this.#revision;
    const pending = (async () => {
      const schema = await this.#provider.describe();
      this.#assertScope(request, generation);
      if (schema.scopeId !== request.scopeId) {
        throw new Error("数据源返回了其他记忆空间的结构");
      }
      await this.#provider.register(schema);
      this.#assertScope(request, generation);
      for (const object of schema.objects) {
        for (const column of object.columns) {
          if (column.reference) {
            Object.freeze(column.reference);
          }
          Object.freeze(column);
        }
        Object.freeze(object.columns);
        Object.freeze(object);
      }
      Object.freeze(schema.objects);
      Object.freeze(schema);
      this.#schema = schema;
      this.#dirty = revision !== this.#revision;
      if (this.#snapshot.sourceId !== schema.sourceId) {
        this.#publish();
      }
      return schema;
    })().finally(() => {
      if (this.#pending === pending) {
        this.#pending = undefined;
      }
    });
    this.#pending = pending;
    return pending;
  }
  async query(request: DataQuery) {
    // SQL and parameters belong to the invocation, even while schema preparation awaits.
    request = { ...request, params: request.params ? { ...request.params } : undefined };
    this.#assertScope(request);
    const generation = this.#generation;
    const schema = await this.describe(request);
    this.#assertScope(request, generation);
    const result = await this.#provider.query(schema, request.sql, request.params);
    this.#assertScope(request, generation);
    // Caller-owned results never share writable arrays with the adapter.
    return Object.freeze({
      ...result,
      columns: Object.freeze([...result.columns]),
      rows: Object.freeze(result.rows.map((row) => Object.freeze([...row]))),
    });
  }
  dispose(): void {
    this.#generation++;
    for (const unsubscribe of this.#unsubscribe) {
      unsubscribe();
    }
    this.#background.dispose();
    this.#listeners.clear();
  }
  #hostChanged = (): void => {
    const chatId = this.#chat.getSnapshot()?.id ?? null;
    if (chatId === this.#lastHostChatId) {
      return;
    }
    this.#lastHostChatId = chatId;
    this.#hostGeneration++;
    this.#publish();
  };
  #sourceChanged = (): void => {
    const context = this.#provider.getContext();
    if (binding(context) !== binding(this.#snapshot.context) || !context.available) {
      this.#generation++;
      this.#pending = undefined;
      this.#schema = null;
    }
    this.#revision++;
    this.#dirty = true;
  };
  #assertScope(request: DataScope, generation?: number): void {
    const context = this.#provider.getContext();
    if (
      binding(context) !== binding(this.#snapshot.context) ||
      context.available !== this.#snapshot.context.available
    ) {
      this.#sourceChanged();
      this.#background.synchronize();
    }
    if (
      (generation !== undefined && generation !== this.#generation) ||
      binding(request) !== binding(context)
    ) {
      throw new Error("资料或聊天已变化，本次查询已取消");
    }
  }
  #characterChat(): string | null {
    if (!this.#matchesMemoryChat(this.#provider.getContext().chatIdentity)) {
      throw new Error("正在切换聊天资料");
    }
    return this.#chat.getSnapshot()?.id ?? null;
  }
  #assertHostChat(chatId: string | null, generation = this.#hostGeneration): void {
    if (this.#characterChat() !== chatId || generation !== this.#hostGeneration) {
      throw new Error("当前聊天已变化");
    }
  }
  #readOverrides(chatId: string | null) {
    return readCharacterOverrides(
      chatId === null ? undefined : this.#characterStorage.read(chatId),
    );
  }
  #publish(): void {
    const background = this.#background.getState();
    const context = this.#provider.getContext();
    const hostChatId = this.#chat.getSnapshot()?.id ?? null;
    const matchingBackground = binding(background.context) === binding(context);
    let data =
      matchingBackground && this.#matchesMemoryChat(context.chatIdentity) ? background.data : null;
    let error = background.error;
    let status = background.status;
    if (data) {
      try {
        data = effectiveBackground(data, this.#readOverrides(hostChatId));
      } catch (cause) {
        data = null;
        status = "error";
        error = cause instanceof Error ? cause.message : String(cause);
      }
    }
    this.#snapshot = Object.freeze({
      ...background,
      data,
      error,
      status,
      context: Object.freeze({ ...context }),
      revision: this.#revision,
      characterRevision: this.#characterRevision,
      hostChatId,
      sourceId: this.#schema?.sourceId ?? this.#background.getState().data?.sourceId ?? null,
    });
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
