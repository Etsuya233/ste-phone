import type { DataAppPublic, DataScope, CharacterProfile } from "../data-source/public.ts";
import { buildWechatPrompt } from "./wechat-prompt.ts";
import type { WechatConversation } from "./wechat.ts";
import type { WechatPerson } from "./wechat.ts";
import type { wechatStickerCatalog } from "./wechat-stickers.ts";

/** 当前范围的帐号候选全部来自 Memory；删除或换范围后不按姓名重绑。 */
export async function readWechatRoster(data: DataAppPublic, account: WechatPerson | null) {
  const scope = data.getSnapshot().context;
  if (!scope.available) {
    throw new Error(scope.message ?? "当前人物资料不可用");
  }
  const background = await data.readBackground(scope);
  if (background.backgroundError) {
    throw new Error(background.backgroundError);
  }
  const present =
    account &&
    account.scopeId === background.stableScopeId &&
    background.characters.some((person) => person.id === account.id);
  return {
    people: background.characters,
    scopeId: background.stableScopeId,
    account: present ? account : null,
  };
}

/** 每轮只取一次材料；微信历史已包含刚保存的用户消息。 */
export async function readWechatPrompt(
  data: DataAppPublic,
  scope: DataScope,
  sender: CharacterProfile,
  recipient: CharacterProfile,
  conversation: WechatConversation,
  stickers: ReturnType<typeof wechatStickerCatalog> = [],
): Promise<string> {
  const summary = await data.readSummary(scope);
  const related = await data.readRelatedBackground({
    ...scope,
    participantIds: [sender.id, recipient.id],
  });
  const recent = await data.readRecentChat({ ...scope, count: 10 });
  const world = await data.readWorldState(scope);
  return buildWechatPrompt({
    sender,
    recipient,
    summary,
    related,
    recent,
    world,
    conversation,
    stickers,
  });
}
