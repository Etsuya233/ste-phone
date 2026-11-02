import type { DataAppPublic, DataScope, SqlValue } from "./public.ts";

export interface WorldState {
  readonly worldTime: string | null;
  readonly location: string | null;
  readonly weather: string | null;
}
/** 保留来源未记录的空值，不以设备时间或推测的地点补全剧情。 */
export async function readWorldState(
  data: DataAppPublic,
  scope: DataScope,
): Promise<readonly WorldState[]> {
  const result = await data.query({
    ...scope,
    sql: "SELECT world_time,current_location,weather FROM phone_world_state",
  });
  if (result.truncated) {
    throw new Error("世界状态读取被截断");
  }
  const text = (value: SqlValue | undefined) => {
    if (value !== null && typeof value !== "string") {
      throw new Error("世界状态字段应为文本或空值");
    }
    return value;
  };
  return result.rows.map(([worldTime, location, weather]) => ({
    worldTime: text(worldTime),
    location: text(location),
    weather: text(weather),
  }));
}
