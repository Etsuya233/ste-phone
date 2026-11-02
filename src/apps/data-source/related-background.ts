import type { DataScope } from "./public.ts";

export interface RelatedBackgroundRequest extends DataScope {
  /** 当前资料范围内的稳定人物身份；查询关联前须映射为实例身份。 */
  readonly participantIds: readonly string[];
}
export interface BackgroundPerson {
  readonly id: string;
  readonly name: string;
}
export interface BackgroundRelationship {
  readonly id: string;
  readonly characterA: BackgroundPerson;
  readonly characterB: BackgroundPerson;
  readonly description: string | null;
  readonly keyFacts: string | null;
}
export interface HeldItem {
  readonly id: string;
  readonly name: string;
  readonly holder: BackgroundPerson;
  readonly description: string | null;
  readonly status: string | null;
}
export interface ImportantEvent {
  readonly id: string;
  readonly name: string;
  readonly details: string | null;
  readonly startTime: string | null;
  readonly endTime: string | null;
  readonly characters: readonly BackgroundPerson[];
  readonly outcome: string | null;
}
export interface BackgroundPersonBrief extends BackgroundPerson {
  readonly personality: string | null;
  readonly background: string | null;
  readonly currentStatus: string | null;
}
/** 相关性只由明确人物引用决定；这些资料不表示角色已经知情。 */
export interface RelatedBackground {
  readonly relationships: readonly BackgroundRelationship[];
  readonly heldItems: readonly HeldItem[];
  readonly importantEvents: readonly ImportantEvent[];
  readonly otherCharacters: readonly BackgroundPersonBrief[];
}
