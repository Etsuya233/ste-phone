import type { Agent, AgentEvent, AgentMessage } from "@earendil-works/pi-agent-core";
import type { Model } from "@earendil-works/pi-ai";

/** 连接仅声明模型 ID；容量和价格未知，实际预算由应用随请求提供。 */
export function createCompletionModel(id: string): Model<"openai-completions"> {
  return {
    id,
    name: id,
    api: "openai-completions",
    provider: "ste-phone",
    baseUrl: "/api/backends/chat-completions",
    reasoning: false,
    input: ["text"],
    contextWindow: 0,
    maxTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

export interface AgentRunResult {
  readonly reply: AgentMessage | undefined;
  readonly timedOut: boolean;
}

/** 只管理一次运行的超时、取消和订阅；回复是否满足业务要求由应用判断。 */
export async function runAgent(
  agent: Agent,
  prompt: string,
  options: {
    signal: AbortSignal;
    timeoutMs: number;
    onEvent(event: AgentEvent): void;
  },
): Promise<AgentRunResult> {
  options.signal.throwIfAborted();
  let timedOut = false;
  const abort = () => agent.abort();
  const unsubscribe = agent.subscribe(options.onEvent);
  options.signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    agent.abort();
  }, options.timeoutMs);
  try {
    await agent.prompt(prompt);
    return { reply: agent.state.messages.at(-1), timedOut };
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", abort);
    unsubscribe();
  }
}
