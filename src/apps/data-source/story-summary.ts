import type { DataAppPublic, DataScope } from "./public.ts";

/** 归属由 Memory 显式引用决定，已总结纪要不再重复注入；不额外调用模型压缩。 */
export async function readStorySummary(data: DataAppPublic, scope: DataScope): Promise<string> {
  const schema = await data.describe(scope);
  for (const name of ["phone_plot_summaries", "phone_summary_sources"]) {
    if (!schema.objects.some((object) => object.name === name)) {
      throw new Error(`剧情总结结构不可用：${name}，请检查 Memory 剧情记忆预设`);
    }
  }
  const missing = await data.query({
    ...scope,
    sql: "SELECT c.record_id FROM phone_summary_sources c LEFT JOIN phone_plot_summaries s ON s.record_id=c.summary_id WHERE c.summary_id IS NOT NULL AND s.record_id IS NULL LIMIT 1",
  });
  if (missing.rows.length) {
    throw new Error(`纪要引用了不存在的剧情总结：${missing.rows[0]![0]}`);
  }
  const sections: string[] = [];
  for (const [view, title, filter] of [
    ["phone_plot_summaries", "已总结剧情", ""],
    ["phone_summary_sources", "后续纪要", " WHERE summary_id IS NULL"],
  ]) {
    const entries = await readSummarySection(data, scope, view!, filter!);
    if (entries.length) {
      sections.push(`【${title}】\n${entries.join("\n\n")}`);
    }
  }
  return sections.join("\n\n");
}

/** 完整分页并格式化一组资料；创建顺序沿用来源，不推断为剧情时间。 */
async function readSummarySection(
  data: DataAppPublic,
  scope: DataScope,
  view: string,
  filter: string,
): Promise<string[]> {
  const entries: string[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await data.query({
      ...scope,
      sql: `SELECT title,start_time,end_time,content FROM ${view}${filter} ORDER BY created_at,record_id LIMIT 200 OFFSET :offset`,
      params: { offset },
    });
    if (page.truncated) {
      throw new Error("剧情总结分页被截断");
    }
    for (const [name, start, end, content] of page.rows) {
      if (typeof name !== "string" || typeof content !== "string" || !content.trim()) {
        throw new Error("剧情总结或纪要的标题、正文格式无效");
      }
      const time = [start, end].filter((value) => value !== null).join(" — ");
      entries.push([name, time, content].filter(Boolean).join("\n"));
    }
    if (page.rows.length < 200) {
      return entries;
    }
  }
}
