import type { ImageRecord } from "../../core/image-hub/public.ts";
export type CharacterAvatar = Pick<ImageRecord, "id" | "imagePath">;

export const characterTextFields = ["name", "personality", "background", "current_status"] as const;
export type CharacterTextField = (typeof characterTextFields)[number];
export type CharacterOverride = Partial<Record<CharacterTextField, string>> & {
  readonly avatar?: CharacterAvatar;
};
export type CharacterChanges = Partial<Record<CharacterTextField, string | null>> & {
  readonly avatar?: CharacterAvatar | null;
};
export interface CharacterOverrides {
  readonly version: 1;
  readonly spaces: Readonly<Record<string, Readonly<Record<string, CharacterOverride>>>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readCharacterOverrides(value: unknown): CharacterOverrides {
  if (value === undefined || value === null) {
    return { version: 1, spaces: {} };
  }
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.spaces)) {
    throw new Error("人物资料覆写数据版本或格式不支持");
  }
  for (const space of Object.values(value.spaces)) {
    if (!isRecord(space)) {
      throw new Error("人物资料覆写空间格式错误");
    }
    for (const person of Object.values(space)) {
      if (!isRecord(person)) {
        throw new Error("人物资料覆写格式错误");
      }
      for (const [key, field] of Object.entries(person)) {
        if (key === "avatar") {
          if (
            !isRecord(field) ||
            typeof field.id !== "string" ||
            !field.id ||
            typeof field.imagePath !== "string" ||
            !field.imagePath
          ) {
            throw new Error("人物通用头像引用格式错误");
          }
        } else if (
          !characterTextFields.some((item) => item === key) ||
          typeof field !== "string" ||
          (key === "name" && !field.trim())
        ) {
          throw new Error("人物资料覆写字段格式错误");
        }
      }
    }
  }
  return value as unknown as CharacterOverrides;
}

export function characterSpaceOverrides(value: CharacterOverrides, spaceId: string) {
  return Object.hasOwn(value.spaces, spaceId) ? value.spaces[spaceId]! : {};
}

export function updateCharacterOverrides(
  stored: CharacterOverrides,
  spaceId: string,
  personId: string,
  changes: CharacterChanges,
): CharacterOverrides {
  const spaces = { ...stored.spaces };
  const existingSpace = Object.hasOwn(spaces, spaceId) ? spaces[spaceId] : undefined;
  const space = { ...existingSpace };
  const existingPerson = Object.hasOwn(space, personId) ? space[personId] : undefined;
  const fields = new Map(Object.entries(existingPerson ?? {}));
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) {
      fields.delete(key);
    } else {
      fields.set(key, key === "name" && typeof value === "string" ? value.trim() : value);
    }
  }
  const updatedSpace = { ...space, [personId]: Object.fromEntries(fields) };
  if (!fields.size) {
    delete updatedSpace[personId];
  }
  const result = { version: 1, spaces: { ...spaces, [spaceId]: updatedSpace } };
  if (!Object.keys(updatedSpace).length) {
    delete result.spaces[spaceId];
  }
  return readCharacterOverrides(result);
}
