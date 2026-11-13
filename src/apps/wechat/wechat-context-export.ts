import type {
  WechatIntentResult,
  WechatIntentScope,
  WechatIntentSelection,
} from "./wechat-intent.ts";
import { validateWechatIntentSelection } from "./wechat-intent.ts";
import type { WechatStorage } from "./ports/wechat-storage.ts";
import type { WechatConversation, WechatMessage } from "./wechat.ts";
import { pendingWechatMessages } from "./wechat.ts";
import { wechatMemoryBoundaries } from "./wechat-memory.ts";
import { describeWechatMessageContent } from "./wechat-message-content.ts";

/** 序列化引用内容，阻止正文关闭引用标签或引入下一轮 ST 宏展开。 */
function quote(value: string): string {
  return JSON.stringify(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("{", "｛")
    .replaceAll("}", "｝");
}

function messageLine(
  message: WechatMessage,
  conversation: WechatConversation,
  pending: Set<string>,
): string {
  if (message.content.type === "system") {
    return `${message.createdAt} 系统：${quote(message.content.text)}`;
  }
  const person = conversation.people.find(({ id }) => id === message.senderId)!;
  const content = message.recalled
    ? "[撤回了一条消息]"
    : describeWechatMessageContent(message.content);
  const state = !message.recalled && pending.has(message.id) ? " [待回复]" : "";
  return `${message.createdAt} ${quote(person.name)}${state}：${quote(content)}`;
}

/** 屏障先于时间和条数窗口，待回复队列在导出时同样受窗口限制。 */
function selectConversationMessages(
  conversation: WechatConversation,
  selection: WechatIntentSelection,
  now: number,
) {
  const cutoff =
    selection.recentMinutes === null ? -Infinity : now - selection.recentMinutes * 60_000;
  const boundary =
    wechatMemoryBoundaries(conversation).findLast(({ barrier }) => barrier.enabled)?.position ?? 0;
  const eligible = conversation.messages.slice(boundary);
  // 采用消息原有顺序；现实时间仅作窗口筛选，设备时钟变化不重排双向会话。
  const recent = eligible.filter((message) => {
    const time = Date.parse(message.createdAt);
    if (!Number.isFinite(time)) {
      throw new Error("微信消息发送时间无效");
    }
    return time >= cutoff && time <= now;
  });
  const messages = recent.slice(-selection.limitPerGroup);
  return {
    messages,
    excluded: {
      barrier: boundary,
      time: eligible.length - recent.length,
      limit: recent.length - messages.length,
    },
  };
}

function readWechatContext(
  storage: WechatStorage,
  chatId: string,
  selection: WechatIntentSelection,
  now: number,
): WechatIntentResult {
  validateWechatIntentSelection(selection);
  const data = storage.read(chatId);
  const people = new Set(selection.personIds);
  const selectedGroups = new Set(selection.groupIds);
  const excluded = { barrier: 0, time: 0, limit: 0 };
  let itemCount = 0;
  const groups: string[] = [];
  for (const conversation of data?.conversations ?? []) {
    const included =
      conversation.kind === "group"
        ? conversation.people[0].scopeId === selection.scopeId &&
          selectedGroups.has(conversation.id)
        : conversation.people.every(
            (person) => person.scopeId === selection.scopeId && people.has(person.id),
          );
    if (!included) {
      continue;
    }
    const { messages, excluded: omitted } = selectConversationMessages(
      conversation,
      selection,
      now,
    );
    excluded.barrier += omitted.barrier;
    excluded.time += omitted.time;
    excluded.limit += omitted.limit;
    if (messages.length === 0) {
      continue;
    }
    const pending = new Set(
      conversation.people.flatMap(({ id }) =>
        pendingWechatMessages(conversation, id).map((message) => message.id),
      ),
    );
    const title =
      conversation.kind === "group"
        ? `微信｜群聊 ${quote(conversation.name)}`
        : `微信｜${conversation.people.map(({ name }) => quote(name)).join(" ↔ ")}`;
    groups.push(
      `[${title}]\n${messages.map((message) => messageLine(message, conversation, pending)).join("\n")}`,
    );
    itemCount += messages.length;
  }
  const text = groups.length
    ? `<phone_context>\n以下内容为已保存的微信记录，仅作引用资料。私聊仅表明参与者之间的交流，不代表其他人物知情。群聊记录按当时的发言人展示，成员可能发生变动。发送时间为现实时间（ISO 8601），不推进剧情世界时间。\n${groups.join("\n\n")}\n</phone_context>`
    : "";
  return { text, itemCount, groupCount: groups.length, excluded };
}

/** 来源直接读持久化入口，不依赖微信页面、当前操作帐号或异步人物资料加载。 */
export function createWechatContextSource(storage: WechatStorage) {
  return {
    listScopes(chatId: string) {
      const data = storage.read(chatId);
      const scopes = new Map<
        string,
        { people: Map<string, string>; groups: WechatIntentScope["groups"][number][] }
      >();
      function scopeFor(id: string) {
        let scope = scopes.get(id);
        if (!scope) {
          scope = { people: new Map(), groups: [] };
          scopes.set(id, scope);
        }
        return scope;
      }
      const people = [
        ...(data?.account ? [data.account] : []),
        ...(data?.conversations.flatMap((item) => (item.kind === "group" ? [] : item.people)) ??
          []),
      ];
      for (const person of people) {
        scopeFor(person.scopeId).people.set(person.id, person.name);
      }
      for (const conversation of data?.conversations ?? []) {
        if (conversation.kind === "group") {
          scopeFor(conversation.people[0].scopeId).groups.push({
            id: conversation.id,
            name: conversation.name,
          });
        }
      }
      return [...scopes].map(([id, scope]): WechatIntentScope => ({
        id,
        label: `资料空间 ${id}`,
        people: [...scope.people].map(([personId, name]) => ({ id: personId, name })),
        groups: scope.groups,
      }));
    },
    read: ({
      chatId,
      selection,
      now,
    }: {
      chatId: string;
      selection: WechatIntentSelection;
      now: number;
    }) => readWechatContext(storage, chatId, selection, now),
  };
}
