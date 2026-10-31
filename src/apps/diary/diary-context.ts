import type {
  DataAppPublic,
  DataScope,
  RecentChatSnapshot,
  SqlValue,
} from "../data-source/public.ts";
import type { DiaryAuthor } from "./diary.ts";

export interface DiaryWorld {
  readonly worldTime: string;
  readonly location: SqlValue;
  readonly weather: SqlValue;
  readonly clothing: SqlValue;
  readonly otherScenes: SqlValue;
}

export interface DiaryChronicle {
  readonly title: SqlValue;
  readonly content: SqlValue;
  readonly startTime: SqlValue;
  readonly endTime: SqlValue;
}

/** 一次生成已经取得的材料；普通资料更新不会重读或替换它们。 */
export interface DiaryContext {
  readonly author: DiaryAuthor;
  readonly world: DiaryWorld;
  readonly chronicles: readonly DiaryChronicle[];
  readonly chat: RecentChatSnapshot;
  readonly skippedChronicles: number;
}

export function currentDiaryScope(data: DataAppPublic): DataScope {
  const { context } = data.getSnapshot();
  if (!context.available || !context.chatIdentity || !context.scopeId)
    throw new Error(context.message ?? "当前 Memory 资料不可用");
  return { chatIdentity: context.chatIdentity, scopeId: context.scopeId };
}

export async function readDiaryAuthors(
  data: DataAppPublic,
  scope: DataScope,
): Promise<DiaryAuthor[]> {
  const schema = await data.describe(scope);
  const authors: DiaryAuthor[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await data.query({
      ...scope,
      sql: "SELECT record_id,name,profile_text FROM phone_characters ORDER BY name,record_id LIMIT 200 OFFSET :offset",
      params: { offset },
    });
    if (page.truncated) throw new Error("人物资料查询被截断");
    for (const [id, name, profileText] of page.rows) {
      if (typeof id !== "string" || typeof name !== "string" || typeof profileText !== "string")
        throw new Error("人物资料字段格式无效");
      authors.push({ id, name, profileText, sourceId: schema.sourceId, scopeId: schema.scopeId });
    }
    if (page.rows.length < 200) return authors;
  }
}

export async function readDiaryWorld(data: DataAppPublic, scope: DataScope): Promise<DiaryWorld> {
  const state = await data.query({
    ...scope,
    sql: "SELECT world_time,datetime(world_time),current_location,weather,clothing,other_scenes FROM phone_world_state LIMIT 2",
  });
  if (state.truncated || state.rows.length !== 1)
    throw new Error("世界状态必须恰好有一条记录，才能确定日记时刻");
  const [worldTime, validTime, location, weather, clothing, otherScenes] = state.rows[0]!;
  if (typeof worldTime !== "string" || typeof validTime !== "string")
    throw new Error("世界状态缺少有效的剧情时间");
  return {
    worldTime,
    location: location!,
    weather: weather!,
    clothing: clothing!,
    otherScenes: otherScenes!,
  };
}

export async function readDiaryContext(
  data: DataAppPublic,
  selected: DiaryAuthor,
  signal: AbortSignal,
): Promise<DiaryContext> {
  const scope = currentDiaryScope(data);
  const schema = await data.describe(scope);
  if (selected.sourceId !== schema.sourceId || selected.scopeId !== schema.scopeId)
    throw new Error("原日记作者已不在当前资料中，请重新选择");
  // 生成只读取所选人物的最新资料，不加载整个作者列表。
  const people = await data.query({
    ...scope,
    sql: "SELECT record_id,name,profile_text FROM phone_characters WHERE record_id=:author",
    params: { author: selected.id },
  });
  if (people.truncated) throw new Error("人物资料查询被截断");
  if (people.rows.length !== 1) throw new Error("原日记作者已不在当前资料中，请重新选择");
  const [id, name, profileText] = people.rows[0]!;
  if (typeof id !== "string" || typeof name !== "string" || typeof profileText !== "string")
    throw new Error("人物资料字段格式无效");
  const author = { id, name, profileText, sourceId: schema.sourceId, scopeId: schema.scopeId };
  const world = await readDiaryWorld(data, scope);
  signal.throwIfAborted();
  // 只取作者关联且在日记时刻前结束的纪要，先选最近五条，返回时再恢复剧情顺序。
  const chronicles = await data.query({
    ...scope,
    sql: `SELECT c.title,c.content,c.start_time,c.end_time FROM phone_chronicles c
      WHERE EXISTS (SELECT 1 FROM phone_chronicle_characters l WHERE l.chronicle_id=c.record_id AND l.character_id=:author)
      AND datetime(c.start_time) IS NOT NULL AND datetime(c.end_time) IS NOT NULL
      AND datetime(c.start_time)<=datetime(c.end_time) AND datetime(c.end_time)<=datetime(:now)
      ORDER BY datetime(c.end_time) DESC,c.record_id DESC LIMIT 5`,
    params: { author: author.id, now: world.worldTime },
  });
  if (chronicles.truncated) throw new Error("最近纪要查询被截断");
  const invalid = await data.query({
    ...scope,
    sql: `SELECT count(*) FROM phone_chronicles c
      WHERE EXISTS (SELECT 1 FROM phone_chronicle_characters l WHERE l.chronicle_id=c.record_id AND l.character_id=:author)
      AND (datetime(c.start_time) IS NULL OR datetime(c.end_time) IS NULL OR datetime(c.start_time)>datetime(c.end_time))`,
    params: { author: author.id },
  });
  const chat = await data.readRecentChat({ ...scope, count: 20 });
  signal.throwIfAborted();
  return {
    author,
    world,
    chat,
    chronicles: [...chronicles.rows].reverse().map(([title, content, startTime, endTime]) => ({
      title: title!,
      content: content!,
      startTime: startTime!,
      endTime: endTime!,
    })),
    skippedChronicles: Number(invalid.rows[0]![0]),
  };
}
