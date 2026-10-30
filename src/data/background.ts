export interface CharacterProfile {
  readonly id: string;
  readonly name: string;
  readonly profileText: string;
}

export interface Chronicle {
  readonly id: string;
  readonly title: string;
  readonly content: string;
}

export interface ItemProfile {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface PhoneBackground {
  readonly sourceId: string;
  readonly scopeId: string;
  readonly characters: readonly CharacterProfile[];
  /** Creation order, with record ID breaking ties; not story chronology. */
  readonly chronicles: readonly Chronicle[];
  readonly items: readonly ItemProfile[];
}

export interface SourceContext {
  readonly sourceName: string;
  readonly chatIdentity: string | null;
  readonly chatName: string | null;
  readonly scopeId: string | null;
  readonly spaceName: string | null;
  readonly available: boolean;
  readonly message: string | null;
}

export interface BackgroundProvider {
  getContext(): SourceContext;
  subscribe(listener: () => void): () => void;
  read(): Promise<PhoneBackground>;
}

export interface DataSourceState {
  readonly context: SourceContext;
  readonly status: "unavailable" | "idle" | "loading" | "ready" | "error";
  readonly data: PhoneBackground | null;
  readonly stale: boolean;
  readonly error: string | null;
  readonly loadedAt: string | null;
}

export interface PhoneDataSource {
  getState(): DataSourceState;
  subscribe(listener: () => void): () => void;
  load(options?: { force?: boolean }): Promise<PhoneBackground>;
}
