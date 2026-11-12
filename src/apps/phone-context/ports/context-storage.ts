import type { PhoneContextData } from "../public.ts";

export interface PhoneContextStorage {
  read(chatId: string): PhoneContextData | null;
  write(chatId: string, data: PhoneContextData): Promise<void>;
}
