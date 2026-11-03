import type { WechatData, WechatPerson, WechatSnapshot } from "./wechat.ts";
import {
  addMoment,
  addMomentComment,
  assertMomentOwner,
  normalizeMomentContent,
  removeMomentComment,
  type MomentContent,
  type WechatMoment,
} from "./wechat-moments.ts";

interface Dependencies {
  snapshot: () => WechatSnapshot;
  busy: () => boolean;
  save: (update: (data: WechatData) => WechatData, signal?: AbortSignal) => Promise<void>;
}

/** 朋友圈拥有内容操作，实际保存与单聊共用微信写入队列。页面仅提交操作参数。 */
export class WechatMomentsService {
  readonly #dependencies: Dependencies;
  constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
  }

  async publish(content: MomentContent): Promise<string> {
    const author = this.#accountForWriting();
    const normalized = normalizeMomentContent(content);
    const id = [...crypto.getRandomValues(new Uint32Array(4))]
      .map((value) => value.toString(16).padStart(8, "0"))
      .join("");
    await this.#dependencies.save((data) =>
      addMoment(data, {
        ...normalized,
        id,
        author,
        createdAt: new Date().toISOString(),
        comments: [],
      }),
    );
    return id;
  }

  async comment(momentId: string, text: string, replyCommentId?: string): Promise<void> {
    const author = this.#accountForWriting();
    const body = text.trim();
    if (!body) {
      throw new Error("请填写评论内容");
    }
    await this.#dependencies.save((data) => {
      const moment = this.#moment(data, author.scopeId, momentId);
      const target = replyCommentId
        ? moment.comments.find((item) => item.id === replyCommentId)
        : undefined;
      if (replyCommentId !== undefined && !target) {
        throw new Error("回复目标已删除或不属于当前动态");
      }
      const next = addMomentComment(moment, {
        id: [...crypto.getRandomValues(new Uint32Array(4))]
          .map((value) => value.toString(16).padStart(8, "0"))
          .join(""),
        author,
        text: body,
        createdAt: new Date().toISOString(),
        ...(target ? { replyTo: { commentId: target.id, author: target.author } } : {}),
      });
      return this.#replace(data, author.scopeId, next);
    });
  }

  async deleteMoment(momentId: string): Promise<void> {
    const account = this.#accountForWriting();
    await this.#dependencies.save((data) => {
      const moment = this.#moment(data, account.scopeId, momentId);
      assertMomentOwner(moment.author, account);
      return {
        ...data,
        moments: {
          ...data.moments,
          [account.scopeId]: data.moments![account.scopeId]!.filter((item) => item.id !== momentId),
        },
      };
    });
  }

  async deleteComment(momentId: string, commentId: string): Promise<void> {
    const account = this.#accountForWriting();
    await this.#dependencies.save((data) => {
      const moment = this.#moment(data, account.scopeId, momentId);
      return this.#replace(data, account.scopeId, removeMomentComment(moment, commentId, account));
    });
  }

  #accountForWriting(): WechatPerson {
    const snapshot = this.#dependencies.snapshot();
    if (this.#dependencies.busy()) {
      throw new Error("请等待当前生成或保存完成");
    }
    const { account } = snapshot.data;
    const person = snapshot.people.find((item) => item.id === account?.id);
    if (
      !snapshot.chatId ||
      snapshot.loading ||
      snapshot.error ||
      !account ||
      !person ||
      account.scopeId !== snapshot.scopeId
    ) {
      throw new Error("当前帐号或人物资料不可用，无法修改朋友圈");
    }
    // 当前姓名用于新署名，已保存内容继续保留原快照，不按姓名重新绑定身份。
    return { id: person.id, name: person.name, scopeId: account.scopeId };
  }

  #moment(data: WechatData, scopeId: string, id: string): WechatMoment {
    const moment = data.moments?.[scopeId]?.find((item) => item.id === id);
    if (!moment) {
      throw new Error("朋友圈动态不存在");
    }
    return moment;
  }

  #replace(data: WechatData, scopeId: string, moment: WechatMoment): WechatData {
    return {
      ...data,
      moments: {
        ...data.moments,
        [scopeId]: data.moments![scopeId]!.map((item) => (item.id === moment.id ? moment : item)),
      },
    };
  }
}
