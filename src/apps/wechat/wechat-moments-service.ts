import type { WechatData, WechatPerson, WechatSnapshot } from "./wechat.ts";
import type { AiTransport } from "../../core/ai/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import { WechatMomentsSession, type MomentGenerationState } from "./wechat-moments-session.ts";
import {
  addMoment,
  addMomentComment,
  assertMomentOwner,
  createMomentRecord,
  normalizeMomentContent,
  removeMomentComment,
  type MomentContent,
  type WechatMoment,
} from "./wechat-moments.ts";

interface Dependencies {
  data: DataAppPublic;
  transport: AiTransport;
  connections: ModelConnectionsReader;
  snapshot: () => WechatSnapshot;
  busy: () => boolean;
  publishGeneration(state: MomentGenerationState): void;
  save: (update: (data: WechatData) => WechatData, signal?: AbortSignal) => Promise<void>;
}

/** 朋友圈拥有内容操作，实际保存与单聊共用微信写入队列。页面仅提交操作参数。 */
export class WechatMomentsService {
  readonly #dependencies: Dependencies;
  readonly generation: WechatMomentsSession;
  constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
    this.generation = new WechatMomentsSession({
      ...dependencies,
      publish: dependencies.publishGeneration,
    });
  }

  async publish(content: MomentContent): Promise<string> {
    const author = this.#accountForWriting();
    const normalized = normalizeMomentContent(content);
    let id!: string;
    await this.#dependencies.save((data) => {
      const record = createMomentRecord(author);
      id = record.id;
      return addMoment(data, {
        ...normalized,
        ...record,
        comments: [],
      });
    });
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
        ...createMomentRecord(author),
        text: body,
        ...(target ? { replyTo: { commentId: target.id, author: target.author } } : {}),
      });
      return this.#replace(data, author.scopeId, next);
    });
  }

  async generatePost(authorId: string): Promise<void> {
    const account = this.#accountForWriting();
    const snapshot = this.#dependencies.snapshot();
    const author = snapshot.people.find((person) => person.id === authorId);
    if (!author) {
      throw new Error("请选择当前资料中的发布人物");
    }
    await this.generation.generate({
      kind: "post",
      author,
      scopeId: account.scopeId,
      scope: { ...this.#dependencies.data.getSnapshot().context },
      guidance: snapshot.data.replyGuidance?.[account.scopeId] ?? {},
      history: snapshot.data.moments?.[account.scopeId] ?? [],
    });
  }

  async generateInteraction(momentId: string): Promise<void> {
    const account = this.#accountForWriting();
    const snapshot = this.#dependencies.snapshot();
    const candidates = snapshot.people.filter((person) => person.id !== account.id);
    if (!candidates.length) {
      throw new Error("没有可参与互动的其他人物");
    }
    await this.generation.generate({
      kind: "interaction",
      account: snapshot.people.find((person) => person.id === account.id)!,
      candidates,
      scopeId: account.scopeId,
      scope: { ...this.#dependencies.data.getSnapshot().context },
      guidance: snapshot.data.replyGuidance?.[account.scopeId] ?? {},
      moment: this.#moment(snapshot.data, account.scopeId, momentId),
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
    if (this.#dependencies.busy() || this.generation.busy) {
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
