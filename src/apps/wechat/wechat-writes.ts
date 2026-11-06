import type { WechatData, WechatSnapshot } from "./wechat.ts";
import type { WechatStorage } from "./ports/wechat-storage.ts";

export interface GeneratedWechatWrite {
  signal: AbortSignal;
  onWriting(): void;
}

/** 所有元数据更新共用串行队列，在实际写入时合并最新数据。聊天载入代次与取消代次独立。 */
export class WechatWrites {
  #queue: Promise<void> = Promise.resolve();
  #count = 0;
  #generation = 0;
  readonly #storage: WechatStorage;
  readonly #snapshot: () => WechatSnapshot;
  readonly #publish: (patch: Partial<WechatSnapshot>) => void;
  constructor(
    storage: WechatStorage,
    snapshot: () => WechatSnapshot,
    publish: (patch: Partial<WechatSnapshot>) => void,
  ) {
    this.#storage = storage;
    this.#snapshot = snapshot;
    this.#publish = publish;
  }
  get busy() {
    return this.#count > 0;
  }
  get generation() {
    return this.#generation;
  }
  changedChat() {
    ++this.#generation;
  }
  async save(
    update: (data: WechatData) => WechatData,
    generated?: GeneratedWechatWrite,
  ): Promise<void> {
    const chatId = this.#snapshot().chatId;
    if (!chatId) {
      throw new Error("请先打开一个 ST 聊天");
    }
    const generation = this.#generation;
    ++this.#count;
    this.#publish({ writeBusy: true });
    const writing = this.#queue.then(async () => {
      generated?.signal.throwIfAborted();
      if (this.#generation !== generation) {
        throw new Error("当前聊天已变化，无法保存微信");
      }
      const account = this.#snapshot().data.account;
      const value = update(this.#snapshot().data);
      // 在队列等待期间仍可取消。固定目标的请求发出后才进入保存阶段。
      const writing = this.#storage.write(chatId, value, generated?.signal);
      generated?.onWriting();
      await writing;
      if (this.#generation === generation) {
        // 切帐号和停止不改变聊天载入代次；保留期间更新的帐号视角。
        this.#publish({
          data: {
            ...value,
            account:
              this.#snapshot().data.account === account
                ? value.account
                : this.#snapshot().data.account,
          },
          error: null,
        });
      } else if (this.#snapshot().chatId === chatId) {
        // 已切走再返回时，捕获快照已过期；从宿主重新读取确认落库后的权威数据。
        // 队列尚未执行下一笔写入，此同步完成后新编辑才能基于最新消息形成更新。
        const persisted = this.#storage.read(chatId);
        if (!persisted) {
          throw new Error("微信保存确认后缺少持久化数据");
        }
        this.#publish({ data: { ...persisted, account: this.#snapshot().data.account } });
      }
    });
    this.#queue = writing.catch(() => {});
    try {
      await writing;
    } finally {
      --this.#count;
      this.#publish({ writeBusy: this.busy });
    }
  }
}
