export interface PhoneChat {
  readonly id: string;
  readonly name: string;
}

export interface ChatContext {
  getSnapshot(): PhoneChat | null;
  subscribe(listener: () => void): () => void;
}
