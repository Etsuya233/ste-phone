import type { CharacterProfile } from "../data-source/public.ts";
import type { DataAppPublic, DataScope, DatabaseSchema } from "../data-source/public.ts";

export interface CampusAuthor {
  id: string;
  name: string;
  avatar?: CharacterProfile["avatar"];
}

export function campusSpace(schema: DatabaseSchema): string {
  return JSON.stringify([schema.sourceId, schema.stableScopeId]);
}

export async function readCampusAuthors(
  data: DataAppPublic,
  scope: DataScope,
  isCurrent: () => boolean,
): Promise<CampusAuthor[] | null> {
  const characters = await data.readCharacters(scope);
  if (!isCurrent()) {
    return null;
  }
  return characters
    .map(({ id, name, avatar }) => ({ id, name, avatar }))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN") || a.id.localeCompare(b.id));
}
