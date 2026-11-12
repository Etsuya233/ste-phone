import type { CharacterOverrides } from "../character-overrides.ts";

export type { CharacterOverrides };
export interface CharacterOverrideStorage {
  read(chatId: string): unknown;
  write(chatId: string, data: CharacterOverrides, assertCurrent?: () => void): Promise<void>;
}
