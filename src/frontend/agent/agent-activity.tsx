import { useState } from "react";

export type AgentToolStatus = "running" | "completed" | "failed";

export interface AgentToolActivity {
  id: string;
  label: string;
  status: AgentToolStatus;
  input?: unknown;
  output?: string | null;
}

/** 思考与工具调用的通用折叠块，默认收起，供各 Agent 页面复用。 */
export function AgentThinking({ text, running = false }: { text: string; running?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="agent-thinking"
      data-running={running}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="agent-disclosure">
        <span
          className="agent-disclosure-icon agent-disclosure-icon--thinking"
          aria-hidden="true"
        />
        <span className="agent-disclosure-title">{running ? "思考中" : "思考过程"}</span>
        <span className="agent-disclosure-chevron" aria-hidden="true" />
      </summary>
      {open ? <div className="agent-thinking-body">{text}</div> : null}
    </details>
  );
}

export function AgentToolCall({ tool }: { tool: AgentToolActivity }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="agent-tool"
      data-status={tool.status}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="agent-disclosure">
        <span className="agent-tool-dot" aria-hidden="true" />
        <span className="agent-disclosure-title">{tool.label}</span>
        <span className="agent-tool-status">
          {tool.status === "running" ? "执行中" : tool.status === "failed" ? "失败" : "完成"}
        </span>
        <span className="agent-disclosure-chevron" aria-hidden="true" />
      </summary>
      {open ? (
        <div className="agent-tool-body">
          {tool.input === undefined ? null : (
            <>
              <span className="agent-tool-label">参数</span>
              <pre>{formatPayload(tool.input)}</pre>
            </>
          )}
          {tool.output ? (
            <>
              <span className="agent-tool-label">结果</span>
              <pre>{tool.output}</pre>
            </>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

function formatPayload(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2) ?? String(value);
}
