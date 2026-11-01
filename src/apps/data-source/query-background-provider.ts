import type { DatabaseProvider } from "./ports/database-provider.ts";
import type { BackgroundProvider, SourceContext } from "./ports/background-provider.ts";
import type { PhoneBackground } from "./background.ts";
import type { DataAppPublic, SqlValue } from "./public.ts";

/** 资料与 SQL App 共用远端视图，分页读取展示所需三类资料。 */
export class QueryBackgroundProvider implements BackgroundProvider {
  readonly #database: DataAppPublic;
  readonly #source: DatabaseProvider;
  constructor(database: DataAppPublic, source: DatabaseProvider) {
    this.#database = database;
    this.#source = source;
  }
  getContext(): SourceContext {
    return this.#source.getContext();
  }
  subscribe(listener: () => void): () => void {
    return this.#source.subscribe(listener);
  }
  async read(): Promise<PhoneBackground> {
    const scope = this.getContext();
    const schema = await this.#database.describe(scope);
    const unavailable = ["phone_characters", "phone_chronicles", "phone_items"].filter(
      (name) => !schema.objects.some((object) => object.name === name),
    );
    if (unavailable.length) {
      const capability = await this.#database.query({
        ...scope,
        sql: "SELECT detail FROM phone_capabilities WHERE object_name = 'background_display'",
      });
      return {
        sourceId: schema.sourceId,
        scopeId: schema.scopeId,
        stableScopeId: schema.stableScopeId,
        characters: [],
        chronicles: [],
        items: [],
        backgroundError: String(capability.rows[0]![0]),
      };
    }
    const rows: SqlValue[][][] = [];
    // 串行分页，完整资料不受单次 SQL 的默认 200 行展示上限影响。
    for (const [view, name] of [
      ["phone_characters", "name"],
      ["phone_chronicles", "title"],
      ["phone_items", "name"],
    ]) {
      const all: SqlValue[][] = [];
      for (let offset = 0; ; offset += 200) {
        const page = await this.#database.query({
          ...scope,
          sql: `SELECT stable_record_id,${name},profile_text FROM ${view} ORDER BY created_at,record_id LIMIT 200 OFFSET :offset`,
          params: { offset },
        });
        if (page.truncated) throw new Error(`资料分页被截断：${view}`);
        all.push(...page.rows.map((row) => [...row]));
        if (page.rows.length < 200) break;
      }
      rows.push(all);
    }
    const text = (value: SqlValue | undefined): string => {
      if (typeof value !== "string") throw new Error("标准资料视图返回了非文本值");
      return value;
    };
    return {
      sourceId: schema.sourceId,
      scopeId: schema.scopeId,
      stableScopeId: schema.stableScopeId,
      characters: rows[0]!.map((row) => ({
        id: text(row[0]),
        name: text(row[1]),
        profileText: text(row[2]),
      })),
      chronicles: rows[1]!.map((row) => ({
        id: text(row[0]),
        title: text(row[1]),
        content: text(row[2]),
      })),
      items: rows[2]!.map((row) => ({
        id: text(row[0]),
        name: text(row[1]),
        description: text(row[2]),
      })),
    };
  }
}
