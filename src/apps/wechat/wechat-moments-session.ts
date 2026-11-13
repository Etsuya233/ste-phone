import type { AiTransport } from "../../core/ai/public.ts";
import type { DataAppPublic } from "../data-source/public.ts";
import type { ModelConnectionsReader } from "../settings/public.ts";
import type { WechatData, WechatPerson } from "./wechat.ts";
import type { GeneratedWechatWrite } from "./wechat-writes.ts";
import {
  addMomentComment,
  createMomentRecord,
  type WechatMoment,
  type MomentDraft,
  type MomentComment,
} from "./wechat-moments.ts";
import { generateWechatOutput } from "./wechat-ai-output.ts";
import {
  momentInteractionWindow,
  momentSystemPrompt,
  readMomentPrompt,
  type MomentGenerationInput,
} from "./wechat-moments-prompt.ts";
import {
  parseGeneratedInteraction,
  parseGeneratedMoment,
  type GeneratedMomentComment,
} from "./wechat-moments-output.ts";

export type MomentGenerationState =
  | { readonly status: "idle" }
  | {
      readonly status: "running" | "saving";
      readonly kind: "post" | "interaction" | "image" | "image-prompt";
      readonly scopeId: string;
    }
  | { readonly status: "complete" | "error"; readonly message: string };

interface Dependencies {
  data: DataAppPublic;
  transport: AiTransport;
  connections: ModelConnectionsReader;
  save(update: (data: WechatData) => WechatData, generated: GeneratedWechatWrite): Promise<void>;
  publish(state: MomentGenerationState): void;
}
interface Task {
  controller: AbortController;
  input: MomentGenerationInput | { kind: "image" | "image-prompt"; scopeId: string };
  committing: boolean;
  detached: boolean;
}

/** 任务固定人物、资料实例与历史输入；取消生成立即释放，保存等待原目标确认。 */
export class WechatMomentsSession {
  readonly #dependencies: Dependencies;
  #task: Task | null = null;
  constructor(dependencies: Dependencies) {
    this.#dependencies = dependencies;
  }
  get busy(): boolean {
    return this.#task !== null;
  }
  get committing(): boolean {
    return this.#task?.committing === true;
  }

  async generate(input: Extract<MomentGenerationInput, { kind: "post" }>): Promise<MomentDraft>;
  async generate(input: Extract<MomentGenerationInput, { kind: "interaction" }>): Promise<void>;
  async generate(input: MomentGenerationInput): Promise<MomentDraft | void> {
    if (this.busy) {
      throw new Error("请等待当前朋友圈生成完成");
    }
    const fixed = structuredClone(input);
    const task: Task = {
      controller: new AbortController(),
      input: fixed,
      committing: false,
      detached: false,
    };
    this.#task = task;
    const { signal } = task.controller;
    this.#publishTask(task, "running");
    try {
      const { connections, data, transport } = this.#dependencies;
      const connectionId = connections.getSnapshot().defaultModelConnectionId;
      if (!connectionId) {
        throw new Error("请先在设置中选择默认模型连接");
      }
      const connection = connections.getConnection(connectionId);
      const prompt = await readMomentPrompt(data, fixed);
      signal.throwIfAborted();
      const output = await generateWechatOutput({
        subject: "朋友圈",
        transport,
        connection,
        prompt,
        systemPrompt: momentSystemPrompt(fixed),
        operation: fixed.kind === "post" ? "朋友圈发布" : "朋友圈互动",
        signal,
      });
      signal.throwIfAborted();
      if (fixed.kind === "post") {
        const content = parseGeneratedMoment(output, fixed.author.id);
        this.#dependencies.publish({ status: "complete", message: "动态草稿已生成。" });
        return {
          ...content,
          author: { id: fixed.author.id, name: fixed.author.name, scopeId: fixed.scopeId },
        };
      }
      const update = this.#validatedUpdate(fixed, output);
      if (update) {
        await this.#dependencies.save(update, {
          signal,
          onWriting: () => {
            task.committing = true;
            this.#publishTask(task, "saving");
          },
        });
      }
      if (!task.detached) {
        this.#dependencies.publish({
          status: "complete",
          message: update ? "互动已保存。" : "本次无人回应。",
        });
      }
    } catch (error) {
      if (this.#task === task && !task.detached) {
        this.#dependencies.publish(
          signal.aborted && (error as Error).name === "AbortError"
            ? { status: "idle" }
            : {
                status: "error",
                message: task.committing
                  ? `朋友圈保存失败：${(error as Error).message}。可重新生成。`
                  : (error as Error).message,
              },
        );
      }
      if (fixed.kind === "post") {
        throw error;
      }
    } finally {
      if (this.#task === task) {
        this.#task = null;
      }
    }
  }

  /** 图片任务与文字生成共用锁和取消归属；Hub 不接受取消，迟到资产仍归图库。 */
  async imageTask<T>(
    kind: "image" | "image-prompt",
    scopeId: string,
    run: (generated: GeneratedWechatWrite) => Promise<T>,
  ): Promise<T> {
    if (this.busy) {
      throw new Error("请等待当前朋友圈生成完成");
    }
    const task: Task = {
      controller: new AbortController(),
      input: { kind, scopeId },
      committing: false,
      detached: false,
    };
    this.#task = task;
    this.#publishTask(task, "running");
    try {
      const result = await run({
        signal: task.controller.signal,
        onWriting: () => {
          task.committing = true;
          this.#publishTask(task, "saving");
        },
      });
      task.controller.signal.throwIfAborted();
      if (!task.detached) {
        this.#dependencies.publish({
          status: "complete",
          message: kind === "image" ? "图片已生成。" : "Prompt 已完善。",
        });
      }
      return result;
    } catch (error) {
      if (this.#task === task && !task.detached) {
        this.#dependencies.publish(
          task.controller.signal.aborted && (error as Error).name === "AbortError"
            ? { status: "idle" }
            : { status: "error", message: (error as Error).message },
        );
      }
      throw error;
    } finally {
      if (this.#task === task) {
        this.#task = null;
      }
    }
  }

  #validatedUpdate(
    input: Extract<MomentGenerationInput, { kind: "interaction" }>,
    output: string,
  ): ((data: WechatData) => WechatData) | null {
    const window = momentInteractionWindow(input.moment);
    const generated = parseGeneratedInteraction(
      output,
      new Set(input.candidates.map((person) => person.id)),
      new Set([...window.comments, ...window.directTargets].map((comment) => comment.id)),
      input.requiredAuthorIds,
    );
    if (!generated.length) {
      return null;
    }
    return (data) => {
      const moment = data.moments?.[input.scopeId]?.find((item) => item.id === input.moment.id);
      if (!moment) {
        throw new Error("朋友圈目标动态不存在");
      }
      const authors = new Map(
        input.candidates.map((person) => [
          person.id,
          { id: person.id, name: person.name, scopeId: input.scopeId },
        ]),
      );
      const next = appendGeneratedComments(moment, generated, authors);
      return {
        ...data,
        moments: {
          ...data.moments,
          [input.scopeId]: data.moments![input.scopeId]!.map((item) =>
            item.id === moment.id ? next : item,
          ),
        },
      };
    };
  }

  #publishTask(task: Task, status: "running" | "saving"): void {
    this.#dependencies.publish({ status, kind: task.input.kind, scopeId: task.input.scopeId });
  }
  dismiss = (): void => {
    if (!this.busy) {
      this.#dependencies.publish({ status: "idle" });
    }
  };
  cancel(viewChanged = false): void {
    const task = this.#task;
    if (task?.committing) {
      if (viewChanged) {
        task.detached = true;
        this.#dependencies.publish({ status: "idle" });
      }
      return;
    }
    task?.controller.abort();
    this.#task = null;
    this.#dependencies.publish({ status: "idle" });
  }
}

function appendGeneratedComments(
  moment: WechatMoment,
  generated: readonly GeneratedMomentComment[],
  authors: ReadonlyMap<string, WechatPerson>,
): WechatMoment {
  const createdAt = new Date().toISOString();
  const batch: MomentComment[] = [];
  let result = moment;
  for (const item of generated) {
    const reply = item.replyTo;
    const target =
      reply?.type === "batch"
        ? batch[reply.index]
        : reply?.type === "existing"
          ? moment.comments.find((comment) => comment.id === reply.commentId)
          : undefined;
    if (reply && !target) {
      throw new Error("朋友圈回复目标不存在");
    }
    const comment: MomentComment = {
      ...createMomentRecord(authors.get(item.authorId)!, createdAt),
      text: item.text,
      ...(target ? { replyTo: { commentId: target.id, author: target.author } } : {}),
    };
    result = addMomentComment(result, comment);
    batch.push(comment);
  }
  return result;
}
