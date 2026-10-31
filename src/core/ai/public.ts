import type { StreamFn } from "@earendil-works/pi-agent-core";
export type { StreamFn } from "@earendil-works/pi-agent-core";
export interface AiConnection {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly customHeaders: Readonly<Record<string, string>>;
}
export interface AiTransport {
  createStream(connection: AiConnection): StreamFn;
}
