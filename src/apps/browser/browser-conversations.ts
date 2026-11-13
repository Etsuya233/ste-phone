import type { BrowserActivity } from "./browser-service.ts";
import type { BrowserData, WebsiteTurn, WebsiteWork } from "./browser.ts";

interface Conversation {
  readonly turns: readonly WebsiteTurn[];
  readonly activity?: BrowserActivity;
}

/** 对话仅存本机，按 ST 聊天与作品隔离；空记录也保留，防止旧宿主记录重新出现。 */
export class BrowserConversations {
  readonly #storage: Pick<Storage, "getItem" | "setItem">;

  constructor(storage: Pick<Storage, "getItem" | "setItem">) {
    this.#storage = storage;
  }

  read(chatId: string): Map<string, Conversation> {
    const value = this.#storage.getItem(this.key(chatId));
    const entries: [string, Conversation][] = value === null ? [] : JSON.parse(value);
    return new Map(
      entries.map(([id, conversation]) => [
        id,
        {
          ...conversation,
          activity:
            conversation.activity?.status === "running"
              ? { ...conversation.activity, status: "stopped" }
              : conversation.activity,
        },
      ]),
    );
  }

  write(
    chatId: string,
    works: readonly WebsiteWork[],
    activities: ReadonlyMap<string, BrowserActivity>,
  ): void {
    const conversations = this.read(chatId);
    for (const work of works) {
      conversations.set(work.id, { turns: work.turns, activity: activities.get(work.id) });
    }
    this.#storage.setItem(this.key(chatId), JSON.stringify([...conversations]));
  }

  restore(chatId: string, data: BrowserData) {
    const conversations = this.read(chatId);
    const works = data.works.map((work) => ({
      ...work,
      turns: conversations.get(work.id)?.turns ?? work.turns,
    }));
    const activities = new Map<string, BrowserActivity>();
    for (const work of works) {
      const activity = conversations.get(work.id)?.activity;
      if (activity) {
        activities.set(work.id, activity);
      }
    }
    // 首次打开时将旧作品内的对话迁移到本机；作品下次保存时移除宿主副本。
    this.write(chatId, works, activities);
    return { saved: { ...data, works }, activities };
  }

  private key(chatId: string): string {
    return `ste-phone:browser-conversations:${chatId}`;
  }
}
