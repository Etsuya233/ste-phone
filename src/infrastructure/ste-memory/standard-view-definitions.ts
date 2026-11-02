import type { MemoryField } from "./public-read-contract.ts";

interface StandardViewDefinition {
  readonly name: string;
  readonly table: string;
  readonly columns: readonly (readonly [string, string, MemoryField["type"]])[];
  readonly profile?: boolean;
}
/** 标准视图逐项声明所需字段；能力分别注册，新增取材不改变旧能力要求。 */
export const standardViewDefinitions: readonly StandardViewDefinition[] = [
  {
    name: "phone_characters",
    table: "characters",
    columns: [
      ["name", "name", "short_text"],
      ["personality", "personality", "long_text"],
      ["background", "background", "long_text"],
      ["current_status", "current_status", "long_text"],
    ],
  },
  {
    name: "phone_chronicles",
    table: "chronicle",
    columns: [
      ["title", "summary", "short_text"],
      ["content", "details", "long_text"],
      ["start_time", "start_time", "datetime"],
      ["end_time", "end_time", "datetime"],
      ["related_character_ids", "related_characters", "multi_reference"],
    ],
  },
  {
    name: "phone_plot_summaries",
    table: "plot_summaries",
    profile: false,
    columns: [
      ["title", "summary", "short_text"],
      ["content", "details", "long_text"],
      ["start_time", "start_time", "datetime"],
      ["end_time", "end_time", "datetime"],
    ],
  },
  {
    name: "phone_summary_sources",
    table: "chronicle",
    profile: false,
    columns: [
      ["title", "summary", "short_text"],
      ["content", "details", "long_text"],
      ["start_time", "start_time", "datetime"],
      ["end_time", "end_time", "datetime"],
      ["summary_id", "plot_summary", "single_reference"],
    ],
  },
  {
    name: "phone_items",
    table: "items",
    columns: [
      ["name", "name", "short_text"],
      ["description", "key_attributes", "long_text"],
      ["owner_id", "owner", "single_reference"],
      ["status", "status", "long_text"],
    ],
  },
  {
    name: "phone_relationships",
    table: "relationships",
    profile: false,
    columns: [
      ["character_a_id", "character_a", "single_reference"],
      ["character_b_id", "character_b", "single_reference"],
      ["description", "summary", "long_text"],
      ["key_facts", "key_facts", "long_text"],
    ],
  },
  {
    name: "phone_important_events",
    table: "important_events",
    profile: false,
    columns: [
      ["name", "name", "short_text"],
      ["details", "details", "long_text"],
      ["start_time", "start_time", "datetime"],
      ["end_time", "end_time", "datetime"],
      ["related_character_ids", "related_characters", "multi_reference"],
      ["outcome", "outcome", "long_text"],
    ],
  },
  {
    name: "phone_world_state",
    table: "story_state",
    profile: false,
    columns: [
      ["name", "name", "short_text"],
      ["world_time", "current_time", "datetime"],
      ["current_location", "current_location", "short_text"],
      ["weather", "weather", "short_text"],
      ["clothing", "clothing", "short_text"],
      ["other_scenes", "other_scenes", "long_text"],
    ],
  },
];
