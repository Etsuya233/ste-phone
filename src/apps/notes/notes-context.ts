import type { DataAppPublic } from "../data-source/public.ts";
import type { NotesRole } from "./notes.ts";

export async function readNotesContext(data: DataAppPublic, role: NotesRole, signal: AbortSignal) {
  const { context, hostChatId } = data.getSnapshot();
  const { chatIdentity, scopeId } = context;
  if (!context.available || !chatIdentity || !scopeId) {
    throw new Error(context.message ?? "当前剧情资料不可用，请打开该角色所在的 ST 聊天");
  }
  const scope = { chatIdentity, scopeId };
  const schema = await data.describe(scope);
  signal.throwIfAborted();
  if (schema.sourceId !== role.sourceId || schema.stableScopeId !== role.scopeId) {
    throw new Error(`角色「${role.name}」不在当前剧情资料中，请打开该角色所在的 ST 聊天`);
  }

  // 笔记跨聊天保存，取材只使用发起写作时的聊天和笔记所属角色。
  const [characters, summary, world, recent] = await Promise.all([
    data.readCharacters(scope, [role.id]),
    data.readSummary(scope),
    data.readWorldState(scope),
    data.readRecentChat({ ...scope, count: 10 }),
  ]);
  signal.throwIfAborted();
  const character = characters.find(({ id }) => id === role.id);
  if (!character) {
    throw new Error(`角色「${role.name}」已不在当前剧情资料中`);
  }
  const currentSchema = await data.describe(scope);
  signal.throwIfAborted();
  const current = data.getSnapshot();
  if (
    current.hostChatId !== hostChatId ||
    current.context.chatIdentity !== chatIdentity ||
    current.context.scopeId !== scopeId ||
    currentSchema.sourceId !== role.sourceId ||
    currentSchema.stableScopeId !== role.scopeId
  ) {
    throw new Error("取材期间聊天或资料空间已变化，请重新生成");
  }
  return {
    character: { name: character.name, profile: character.profileText },
    summary,
    world,
    recent: recent.messages,
  };
}
