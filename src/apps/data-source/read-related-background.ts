import type { DataAppPublic, DataScope, SqlValue } from "./public.ts";
import type {
  BackgroundPersonBrief,
  RelatedBackground,
  RelatedBackgroundRequest,
} from "./related-background.ts";

/** 只扩展原始参与者的一跳显式引用；第三人不会成为下一轮筛选的参与者。 */
export async function readRelatedBackground(
  data: DataAppPublic,
  request: RelatedBackgroundRequest,
): Promise<RelatedBackground> {
  const scope = { chatIdentity: request.chatIdentity, scopeId: request.scopeId };
  const participantIds = [...new Set(request.participantIds)];
  if (!participantIds.length) {
    throw new Error("关联资料至少需要一位参与人物");
  }
  await assertRelatedCapabilities(data, scope);
  const people = await readPeople(data, scope, "stable_record_id", participantIds);
  if (people.size !== participantIds.length) {
    throw new Error("参与人物已不在当前资料范围内");
  }
  // Memory 外部引用字段保存实例 ID，不能与稳定人物 ID 直接比较。
  const params = { people: JSON.stringify([...people.keys()]) };
  const { relationships, items, events } = await readParticipantRecords(data, scope, params);
  const linkedIds = new Set(
    relationships.flatMap((row) => [requiredText(row[1]), requiredText(row[2])]),
  );
  const eventPeople = events.map((row) => referenceList(row[5]));
  for (const ids of eventPeople) {
    for (const id of ids) {
      linkedIds.add(id);
    }
  }
  const otherIds = [...linkedIds].filter((id) => !people.has(id));
  const otherPeople = await readPeople(data, scope, "record_id", otherIds);
  if (otherPeople.size !== otherIds.length) {
    throw new Error("关联资料引用了不存在的人物");
  }
  const allPeople = new Map([...people, ...otherPeople]);
  return assembleRelatedBackground(relationships, items, events, eventPeople, allPeople, [
    ...otherPeople.values(),
  ]);
}

async function assertRelatedCapabilities(data: DataAppPublic, scope: DataScope): Promise<void> {
  const schema = await data.describe(scope);
  for (const name of [
    "phone_characters",
    "phone_relationships",
    "phone_items",
    "phone_important_events",
  ]) {
    if (schema.objects.some((object) => object.name === name)) {
      continue;
    }
    const reason = await data.query({
      ...scope,
      sql: "SELECT detail FROM phone_capabilities WHERE object_name=:name",
      params: { name },
    });
    throw new Error(`关联资料结构不可用：${name}：${reason.rows.map((row) => row[0]).join("；")}`);
  }
}

/** 三类记录始终锚定原始参与人物，返回顺序由各自的来源创建顺序决定。 */
async function readParticipantRecords(
  data: DataAppPublic,
  scope: DataScope,
  params: Readonly<Record<string, SqlValue>>,
) {
  const relationships = await readRows(
    data,
    scope,
    "SELECT stable_record_id,character_a_id,character_b_id,description,key_facts FROM phone_relationships WHERE character_a_id IN (SELECT value FROM json_each(:people)) OR character_b_id IN (SELECT value FROM json_each(:people))",
    params,
  );
  const items = await readRows(
    data,
    scope,
    "SELECT stable_record_id,name,owner_id,description,status FROM phone_items WHERE owner_id IN (SELECT value FROM json_each(:people))",
    params,
  );
  const events = await readRows(
    data,
    scope,
    "SELECT stable_record_id,name,details,start_time,end_time,related_character_ids,outcome FROM phone_important_events WHERE EXISTS (SELECT 1 FROM json_each(related_character_ids) WHERE value IN (SELECT value FROM json_each(:people)))",
    params,
  );
  return { relationships, items, events };
}

async function readRows(
  data: DataAppPublic,
  scope: DataScope,
  sql: string,
  params: Readonly<Record<string, SqlValue>>,
): Promise<readonly SqlValue[][]> {
  const rows: SqlValue[][] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await data.query({
      ...scope,
      sql: `${sql} ORDER BY created_at,record_id LIMIT 200 OFFSET :offset`,
      params: { ...params, offset },
    });
    if (page.truncated) {
      throw new Error("关联资料分页被截断");
    }
    rows.push(...page.rows.map((row) => [...row]));
    if (page.rows.length < 200) {
      return rows;
    }
  }
}

async function readPeople(
  data: DataAppPublic,
  scope: DataScope,
  identity: "record_id" | "stable_record_id",
  ids: readonly string[],
) {
  const result = new Map<string, BackgroundPersonBrief>();
  if (!ids.length) {
    return result;
  }
  const rows = await readRows(
    data,
    scope,
    `SELECT record_id,stable_record_id,name,personality,background,current_status FROM phone_characters WHERE ${identity} IN (SELECT value FROM json_each(:ids))`,
    { ids: JSON.stringify(ids) },
  );
  for (const [instanceId, id, name, personality, background, currentStatus] of rows) {
    result.set(requiredText(instanceId), {
      id: requiredText(id),
      name: requiredText(name),
      personality: nullableText(personality),
      background: nullableText(background),
      currentStatus: nullableText(currentStatus),
    });
  }
  return result;
}

function assembleRelatedBackground(
  relationships: readonly SqlValue[][],
  items: readonly SqlValue[][],
  events: readonly SqlValue[][],
  eventPeople: readonly string[][],
  people: ReadonlyMap<string, BackgroundPersonBrief>,
  otherCharacters: readonly BackgroundPersonBrief[],
): RelatedBackground {
  const person = (value: SqlValue | undefined) => {
    const record = people.get(requiredText(value));
    if (!record) {
      throw new Error("关联资料引用了不存在的人物");
    }
    return { id: record.id, name: record.name };
  };
  return {
    relationships: relationships.map(([id, a, b, description, keyFacts]) => ({
      id: requiredText(id),
      characterA: person(a),
      characterB: person(b),
      description: nullableText(description),
      keyFacts: nullableText(keyFacts),
    })),
    heldItems: items.map(([id, name, holder, description, status]) => ({
      id: requiredText(id),
      name: requiredText(name),
      holder: person(holder),
      description: nullableText(description),
      status: nullableText(status),
    })),
    importantEvents: events.map(([id, name, details, start, end, , outcome], index) => ({
      id: requiredText(id),
      name: requiredText(name),
      details: nullableText(details),
      startTime: nullableText(start),
      endTime: nullableText(end),
      characters: eventPeople[index]!.map(person),
      outcome: nullableText(outcome),
    })),
    otherCharacters,
  };
}

function requiredText(value: SqlValue | undefined): string {
  if (typeof value !== "string") {
    throw new Error("关联资料字段应为文本");
  }
  return value;
}
function nullableText(value: SqlValue | undefined): string | null {
  if (value === null) {
    return null;
  }
  return requiredText(value);
}
function referenceList(value: SqlValue | undefined): string[] {
  if (value === null) {
    return [];
  }
  const ids: unknown = JSON.parse(requiredText(value));
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    throw new Error("事件人物引用应为人物 ID 数组");
  }
  return [...new Set(ids as string[])];
}
