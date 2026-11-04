import type { MomentDraft, MomentImage } from "./wechat-moments.ts";
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
  momentImageAt,
  removeMomentComment,
  type MomentContent,
  type WechatMoment,
} from "./wechat-moments.ts";

import type { ImageHub, ImageRecord } from "../../core/image-hub/public.ts";
import {
  generateRefinedMomentImagePrompt,
  momentImagePromptInput,
} from "./wechat-moments-image-prompt.ts";

interface Dependencies {
  imageHub: ImageHub;
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

  async publish(content: MomentContent, fixedAuthor?: WechatPerson): Promise<string> {
    const account = this.#accountForWriting();
    const author = fixedAuthor ?? account;
    if (
      author.scopeId !== account.scopeId ||
      !this.#dependencies.snapshot().people.some((person) => person.id === author.id)
    ) {
      throw new Error("草稿作者不属于当前资料空间");
    }
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

  async generatePost(authorId: string, userDirection = ""): Promise<MomentDraft> {
    const account = this.#accountForWriting();
    const snapshot = this.#dependencies.snapshot();
    const author = snapshot.people.find((person) => person.id === authorId);
    if (!author) {
      throw new Error("请选择当前资料中的发布人物");
    }
    return this.generation.generate({
      kind: "post",
      userDirection: userDirection.trim(),
      author,
      scopeId: account.scopeId,
      scope: { ...this.#dependencies.data.getSnapshot().context },
      guidance: snapshot.data.replyGuidance?.[account.scopeId] ?? {},
      history: snapshot.data.moments?.[account.scopeId] ?? [],
    });
  }

  async generateInteraction(
    momentId: string,
    participantIds: readonly string[] = [],
    userDirection = "",
  ): Promise<void> {
    const account = this.#accountForWriting();
    const snapshot = this.#dependencies.snapshot();
    if (participantIds.length > 5) {
      throw new Error("最多选择 5 位互动人物");
    }
    if (new Set(participantIds).size !== participantIds.length) {
      throw new Error("互动人物不能重复选择");
    }
    // 显式选择固定允许名单，每位必须参与；空选择让模型从其余有效人物中自行挑选。
    const candidates = participantIds.length
      ? participantIds.map((id) => {
          if (id === account.id) {
            throw new Error("不能选择当前帐号参与 AI 互动");
          }
          const person = snapshot.people.find((item) => item.id === id);
          if (!person) {
            throw new Error("互动人物不属于当前有效资料");
          }
          return person;
        })
      : snapshot.people.filter((person) => person.id !== account.id);
    if (!candidates.length) {
      throw new Error("没有可参与互动的其他人物");
    }
    await this.generation.generate({
      kind: "interaction",
      userDirection: userDirection.trim(),
      account: snapshot.people.find((person) => person.id === account.id)!,
      candidates,
      requiredAuthorIds: [...participantIds],
      scopeId: account.scopeId,
      scope: { ...this.#dependencies.data.getSnapshot().context },
      guidance: Object.fromEntries(
        [account.id, ...candidates.map((person) => person.id)].map((id) => [
          id,
          snapshot.data.replyGuidance?.[account.scopeId]?.[id] ?? "",
        ]),
      ),
      moment: this.#moment(snapshot.data, account.scopeId, momentId),
    });
  }

  async saveImagePrompt(momentId: string, index: number, prompt: string): Promise<void> {
    const account = this.#accountForWriting();
    if (!prompt.trim()) {
      throw new Error("请填写绘图 Prompt");
    }
    await this.#dependencies.save((data) =>
      this.#updateImage(data, account.scopeId, momentId, index, (item) => ({
        ...item,
        prompt: prompt.trim(),
      })),
    );
  }

  async selectImage(momentId: string, index: number, image: ImageRecord): Promise<void> {
    const account = this.#accountForWriting();
    await this.#dependencies.save((data) =>
      this.#updateImage(data, account.scopeId, momentId, index, (item) => ({
        ...item,
        image: { id: image.id, imagePath: image.imagePath },
      })),
    );
  }

  async generateImage(momentId: string, index: number): Promise<void> {
    const account = this.#accountForWriting();
    const moment = this.#moment(this.#dependencies.snapshot().data, account.scopeId, momentId);
    const item = momentImageAt(moment, index);
    if (!item.prompt?.trim()) {
      throw new Error("请先填写并保存绘图 Prompt");
    }
    await this.generation.imageTask("image", account.scopeId, async (signal, saving) => {
      const images = await this.#dependencies.imageHub.generate({ prompt: item.prompt! });
      signal.throwIfAborted();
      if (!images.length) {
        throw new Error("Image Hub 未返回图片");
      }
      saving();
      try {
        await this.#dependencies.save(
          (data) =>
            this.#updateImage(data, account.scopeId, momentId, index, (current) => ({
              ...current,
              image: { id: images[0]!.id, imagePath: images[0]!.imagePath },
            })),
          signal,
        );
      } catch (error) {
        if (signal.aborted && (error as Error).name === "AbortError") {
          throw error;
        }
        throw new Error(`图片已保存在图库，关联朋友圈失败：${(error as Error).message}`, {
          cause: error,
        });
      }
    });
  }

  async refineImagePrompt(momentId: string, index: number, prompt?: string): Promise<string> {
    const account = this.#accountForWriting();
    const snapshot = this.#dependencies.snapshot();
    const moment = this.#moment(snapshot.data, account.scopeId, momentId);
    const item = momentImageAt(moment, index);
    const input = momentImagePromptInput(moment, item, snapshot.people, prompt);
    return this.generation.imageTask("image-prompt", account.scopeId, (signal) =>
      generateRefinedMomentImagePrompt(this.#dependencies, input, signal),
    );
  }

  async generateDraftImage(draft: MomentDraft, index: number): Promise<MomentImage> {
    const account = this.#accountForWriting();
    if (draft.author.scopeId !== account.scopeId) {
      throw new Error("草稿不属于当前资料空间");
    }
    const item = structuredClone(momentImageAt(draft, index));
    if (!item.prompt?.trim()) {
      throw new Error("请先填写绘图 Prompt");
    }
    return this.generation.imageTask("image", account.scopeId, async (signal) => {
      const images = await this.#dependencies.imageHub.generate({ prompt: item.prompt! });
      signal.throwIfAborted();
      if (!images.length) {
        throw new Error("Image Hub 未返回图片");
      }
      return { ...item, image: { id: images[0]!.id, imagePath: images[0]!.imagePath } };
    });
  }

  async refineDraftImagePrompt(
    draft: MomentDraft,
    index: number,
    prompt?: string,
  ): Promise<string> {
    const account = this.#accountForWriting();
    if (draft.author.scopeId !== account.scopeId) {
      throw new Error("草稿不属于当前资料空间");
    }
    const input = momentImagePromptInput(
      draft,
      momentImageAt(draft, index),
      this.#dependencies.snapshot().people,
      prompt,
    );
    return this.generation.imageTask("image-prompt", account.scopeId, (signal) =>
      generateRefinedMomentImagePrompt(this.#dependencies, input, signal),
    );
  }

  #updateImage(
    data: WechatData,
    scopeId: string,
    momentId: string,
    index: number,
    update: (item: MomentImage) => MomentImage,
  ): WechatData {
    const moment = this.#moment(data, scopeId, momentId);
    const current = momentImageAt(moment, index);
    if (moment.media.type !== "images") {
      throw new Error("朋友圈媒体类型已变化");
    }
    const content = normalizeMomentContent({
      text: moment.text,
      media: {
        type: "images",
        items: moment.media.items.map((item, position) =>
          position === index ? update(current) : item,
        ),
      },
    });
    return this.#replace(data, scopeId, { ...moment, ...content });
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
