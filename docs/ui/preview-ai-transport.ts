import { previewMapReply } from "./preview-map.ts";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import type { PhoneLog } from "../../src/apps/logs/public.ts";
import type { AiTransport } from "../../src/core/ai/public.ts";
import { previewMomentOutput } from "./preview-wechat-moments-ai.ts";

/** 预览复用设置的 Agent 流程，仅替换传输，始终不请求配置的模型服务。 */
export function createPreviewAiTransport(mode: string | null, logs: PhoneLog): AiTransport {
  return {
    createStream: (_connection, diagnostics) => (model, context, options) => {
      const app = diagnostics?.app ?? "system";
      const operation = diagnostics?.operation ?? "模型请求";
      logs.info(app, "STE Phone AI", `${operation} 模拟请求`, {
        simulated: true,
        model: model.id,
        mode: mode ?? "normal",
        messages: context.messages.length,
      });
      const stream = createAssistantMessageEventStream();
      const output: AssistantMessage = {
        role: "assistant",
        content: [],
        api: model.api,
        provider: model.provider,
        model: model.id,
        timestamp: Date.now(),
        stopReason: "stop",
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
      };
      stream.push({ type: "start", partial: output });
      const abort = () => {
        clearTimeout(timer);
        options?.signal?.removeEventListener("abort", abort);
        output.stopReason = "aborted";
        output.errorMessage = "连接测试已取消";
        logs.warn(app, "STE Phone AI", `${operation} 模拟取消`, {
          simulated: true,
          model: model.id,
        });
        stream.push({ type: "error", reason: "aborted", error: output });
      };
      const timer = setTimeout(
        () => {
          options?.signal?.removeEventListener("abort", abort);
          if (mode === "error") {
            output.stopReason = "error";
            output.errorMessage = "模拟测试失败：服务暂不可用，未请求真实服务";
            logs.error(app, "STE Phone AI", `${operation} 模拟失败`, {
              simulated: true,
              model: model.id,
              message: output.errorMessage,
            });
            stream.push({ type: "error", reason: "error", error: output });
            return;
          }
          const text =
            app === "map"
              ? previewMapReply(context.messages, mode)
              : operation === "朋友圈配图提示词"
                ? mode === "invalid"
                  ? "模拟非法 JSON"
                  : previewMomentImagePrompt(context.messages)
                : context.systemPrompt?.includes("微信朋友圈内容")
                  ? previewMomentOutput(context.messages, mode)
                  : context.systemPrompt?.includes("微信单聊")
                    ? mode === "invalid"
                      ? "模拟非法 JSON"
                      : JSON.stringify({
                          messages: [
                            { type: "text", text: "【模拟回复】刚看到消息。" },
                            {
                              type: "text",
                              text:
                                previewWechatSticker(context.messages) ??
                                "明天一起去图书馆吧，稿件我会带上。",
                            },
                          ],
                        })
                    : operation === "日记配图描述"
                      ? mode === "invalid"
                        ? "模拟非法 JSON"
                        : JSON.stringify({
                            imagePrompt:
                              "小红和小蓝坐在图书馆窗边，共同翻阅蓝色笔记本，暖色日光落在稿纸上，安静温柔的午后。",
                          })
                      : context.systemPrompt?.includes("日记")
                        ? mode === "invalid"
                          ? "模拟非法 JSON"
                          : JSON.stringify({
                              body: "【模拟日记，未请求真实模型】\n\n图书馆里很安静，窗边的光照在蓝色笔记本上。我把本子推给小蓝的时候，心里还在想着周五的朗读会。听见他说明天会带来校对好的稿件，我松了一口气。\n\n准备的事情似乎总也做不完，可有人一起认真对待，就没有那么慌张了。现在只想把这一点小小的安心记下来。",
                              imagePrompt:
                                "小红把蓝色笔记本推给图书馆窗边的小蓝，桌面散落朗读会稿纸，午后阳光柔和，人物神情安心。",
                            })
                        : `模拟回复：${model.id} 的预览测试完成，未请求真实服务。`;
          output.content = [{ type: "text", text: "" }];
          stream.push({ type: "text_start", contentIndex: 0, partial: output });
          output.content[0] = { type: "text", text };
          stream.push({ type: "text_delta", contentIndex: 0, delta: text, partial: output });
          stream.push({ type: "text_end", contentIndex: 0, content: text, partial: output });
          output.stopReason = mode === "length" ? "length" : "stop";
          logs.info(app, "STE Phone AI", `${operation} 模拟完成`, {
            simulated: true,
            model: model.id,
            stopReason: output.stopReason,
            textCharacters: text.length,
          });
          stream.push({ type: "done", reason: output.stopReason, message: output });
        },
        mode === "slow" ? 15_000 : 600,
      );
      options?.signal?.addEventListener("abort", abort, { once: true });
      if (options?.signal?.aborted) {
        abort();
      }
      return stream;
    },
  };
}

/** 用本次图片描述模拟完善后的独立绘图提示词，便于检查多图是否串位。 */
function previewMomentImagePrompt(messages: readonly unknown[]): string {
  const user = messages.at(-1) as { content: string | { type: string; text?: string }[] };
  const text =
    typeof user.content === "string"
      ? user.content
      : user.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("");
  const input = JSON.parse(text) as {
    description: string;
    prompt?: string;
    characters: { name: string }[];
  };
  return JSON.stringify({
    prompt: `【模拟完善】${input.description}。${input.characters.map((person) => person.name).join("、")}。${input.prompt ?? ""} 使用自然纪实构图，主体清楚，前景与背景层次分明，光线柔和，保留描述中的人物动作与场景，不额外添加人物、文字或边框。`,
  });
}

/** 预览只从本轮实际传入的清单选表情，便于验证开关与双方发送，仍不请求模型。 */
function previewWechatSticker(messages: readonly unknown[]): string | undefined {
  const user = messages.at(-1) as { content: string | { type: string; text?: string }[] };
  const text =
    typeof user.content === "string"
      ? user.content
      : user.content
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join("");
  const prompt = JSON.parse(text) as { 可用表情: { marker: string }[] };
  return prompt.可用表情[0]?.marker;
}
