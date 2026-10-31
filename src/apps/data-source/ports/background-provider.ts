import type { PhoneBackground } from "../background.ts";

/** 当前来源的读取范围。聊天身份与资料范围分开，允许不同聊天共享资料。 */
export interface SourceContext {
  readonly sourceName: string;
  readonly chatIdentity: string | null;
  readonly chatName: string | null;
  readonly scopeId: string | null;
  readonly spaceName: string | null;
  readonly available: boolean;
  /** 未连接、空间未就绪等不可读取原因，由具体来源提供。 */
  readonly message: string | null;
}

/**
 * 外部资料的读取约定。具体适配器负责连接、结构校验和转换，核心只管理缓存。
 * getContext 必须返回当前绑定；数据或绑定变化均需通知订阅方。
 */
export interface BackgroundProvider {
  getContext(): SourceContext;
  subscribe(listener: () => void): () => void;
  read(): Promise<PhoneBackground>;
}
