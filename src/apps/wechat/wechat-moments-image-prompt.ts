import type { CharacterProfile } from "../data-source/public.ts";
import type { MomentImage, MomentDraft } from "./wechat-moments.ts";

/** 仅提供作者与材料中明确提及的人物，避免把无关人物资料及私聊传给绘图任务。 */
export function momentImagePromptInput(
  moment: MomentDraft,
  item: MomentImage,
  people: readonly CharacterProfile[],
  draft?: string,
): string {
  const prompt = draft === undefined ? item.prompt : draft;
  const material = [moment.text, item.description, prompt ?? ""].join("\n");
  return JSON.stringify({
    author: moment.author,
    text: moment.text,
    description: item.description,
    prompt,
    characters: people
      .filter((person) => person.id === moment.author.id || material.includes(person.name))
      .map(({ id, name, profileText }) => ({ id, name, profileText })),
  });
}
