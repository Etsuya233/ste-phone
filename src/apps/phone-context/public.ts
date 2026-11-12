export interface PhoneContextPreset {
  readonly id: string;
  readonly name: string;
  readonly sourceId: string;
  readonly intentId: string;
}

export interface PhoneContextData {
  readonly version: 2;
  readonly presets: readonly PhoneContextPreset[];
}

export interface PhoneContextSnapshot {
  readonly chatId: string | null;
  readonly presets: readonly PhoneContextPreset[];
  readonly saving: boolean;
  readonly error: string | null;
}

export { PhoneContextService } from "./phone-context-service.ts";
export { validateContextData, validateContextPreset } from "./context-validation.ts";
