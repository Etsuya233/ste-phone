import type { CharacterProfile, PhoneBackground } from "./background.ts";
import {
  characterSpaceOverrides,
  type CharacterOverride,
  type CharacterOverrides,
  type CharacterTextField,
} from "./character-overrides.ts";
import type { DataAppPublic, DataScope, SqlValue } from "./public.ts";

export interface CharacterProfileField {
  readonly key: string;
  readonly label: string;
  readonly value: string | null;
}
export interface SourceCharacter extends CharacterProfile {
  readonly recordId: string;
  readonly fields: readonly CharacterProfileField[];
}

export async function readSourceCharacters(
  data: Pick<DataAppPublic, "query">,
  scope: DataScope,
  filter?: { readonly column: "record_id" | "stable_record_id"; readonly ids: readonly string[] },
): Promise<readonly SourceCharacter[]> {
  if (filter && !filter.ids.length) {
    return [];
  }
  const characters: SourceCharacter[] = [];
  const where = filter ? `WHERE ${filter.column} IN (SELECT value FROM json_each(:ids))` : "";
  for (let offset = 0; ; offset += 200) {
    const page = await data.query({
      ...scope,
      sql: `SELECT stable_record_id,name,profile_text,record_id,profile_fields FROM phone_characters ${where} ORDER BY created_at,record_id LIMIT 200 OFFSET :offset`,
      params: filter ? { offset, ids: JSON.stringify(filter.ids) } : { offset },
    });
    if (page.truncated) {
      throw new Error("人物资料分页被截断");
    }
    for (const [id, name, profileText, recordId, fieldJson] of page.rows) {
      const fields: unknown = JSON.parse(readText(fieldJson));
      if (!Array.isArray(fields)) {
        throw new Error("人物资料字段应为数组");
      }
      characters.push(
        Object.freeze({
          id: readText(id),
          name: readText(name),
          profileText: readText(profileText),
          recordId: readText(recordId),
          fields: Object.freeze(
            fields.map(([key, label, value]: SqlValue[]) =>
              Object.freeze({
                key: readText(key),
                label: readText(label),
                value: value === null ? null : readText(value),
              }),
            ),
          ),
        }),
      );
    }
    if (page.rows.length < 200) {
      return Object.freeze(characters);
    }
  }
}

export function effectiveCharacter(
  character: CharacterProfile,
  overrides: Readonly<Record<string, CharacterOverride>>,
): CharacterProfile {
  const override = Object.hasOwn(overrides, character.id) ? overrides[character.id] : undefined;
  if (!override) {
    return character;
  }
  const fields = character.fields?.map((field) => {
    const value = override[field.key as CharacterTextField];
    return typeof value === "string" ? Object.freeze({ ...field, value }) : field;
  });
  if (!fields) {
    throw new Error("缺少结构化人物资料");
  }
  const profileText = fields
    .flatMap(({ label, value }) => (value ? [`${label}：${value}`] : []))
    .join("\n")
    .replace(/\n+$/, "");
  return Object.freeze({
    ...character,
    name: override.name ?? character.name,
    fields: Object.freeze(fields),
    profileText,
    overriddenFields: Object.freeze(
      Object.keys(override).filter((key) => key !== "avatar") as CharacterTextField[],
    ),
    avatar: override.avatar && Object.freeze({ ...override.avatar }),
  });
}

export function effectiveBackground(
  data: PhoneBackground,
  snapshot: CharacterOverrides,
): PhoneBackground {
  const overrides = characterSpaceOverrides(snapshot, data.stableScopeId);
  if (!Object.keys(overrides).length) {
    return data;
  }
  return Object.freeze({
    ...data,
    characters: Object.freeze(
      data.characters.map((character) => effectiveCharacter(character, overrides)),
    ),
  });
}

function readText(value: SqlValue | undefined): string {
  if (typeof value !== "string") {
    throw new Error("人物资料字段应为文本");
  }
  return value;
}
