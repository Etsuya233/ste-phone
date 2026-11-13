import type { DataAppPublic } from "../data-source/public.ts";
import type { WebsiteAuthor } from "./browser.ts";

export interface BrowserAuthor extends WebsiteAuthor {
  readonly profileText: string;
}

export async function readBrowserAuthors(data: DataAppPublic): Promise<BrowserAuthor[]> {
  const { context } = data.getSnapshot();
  if (!context.available || !context.chatIdentity || !context.scopeId) {
    throw new Error(context.message ?? "当前 Memory 资料不可用");
  }
  const scope = { chatIdentity: context.chatIdentity, scopeId: context.scopeId };
  const schema = await data.describe(scope);
  const characters = await data.readCharacters(scope);
  return characters.map(({ id, name, profileText }) => ({
    sourceId: schema.sourceId,
    scopeId: schema.stableScopeId,
    id,
    name,
    profileText,
  }));
}

export function sameWebsiteAuthor(left: WebsiteAuthor, right: WebsiteAuthor): boolean {
  return left.sourceId === right.sourceId && left.scopeId === right.scopeId && left.id === right.id;
}
