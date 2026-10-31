export interface RecentChatMessage {
  readonly floor: number;
  readonly name: string;
  readonly role: "user" | "assistant" | "narrator";
  readonly content: string;
}

/** Chat input already filtered and cleaned by its source, with original floor attribution. */
export interface RecentChatSnapshot {
  readonly chatIdentity: string;
  readonly messages: readonly RecentChatMessage[];
  readonly cleaning: {
    readonly enabled: boolean;
    readonly ruleId: string | null;
    readonly ruleName: string | null;
  };
}
