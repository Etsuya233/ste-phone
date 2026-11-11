import type { DataAppPublic, DataScope, DatabaseSchema } from "../data-source/public.ts";

export interface CampusAuthor {
  id: string;
  name: string;
}

export function campusSpace(schema: DatabaseSchema): string {
  return JSON.stringify([schema.sourceId, schema.stableScopeId]);
}

export async function readCampusAuthors(
  data: DataAppPublic,
  scope: DataScope,
  isCurrent: () => boolean,
): Promise<CampusAuthor[] | null> {
  const authors: CampusAuthor[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await data.query({
      ...scope,
      sql: "SELECT stable_record_id,name FROM phone_characters ORDER BY name,record_id LIMIT 200 OFFSET :offset",
      params: { offset },
    });
    if (!isCurrent()) {
      return null;
    }
    if (page.truncated) {
      throw new Error("校园社区人物资料查询被截断");
    }
    for (const [id, name] of page.rows) {
      if (typeof id !== "string" || typeof name !== "string") {
        throw new Error("校园社区人物资料字段无效");
      }
      authors.push({ id, name });
    }
    if (page.rows.length < 200) {
      return authors;
    }
  }
}
