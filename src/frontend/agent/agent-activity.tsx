import { useState, type ReactNode } from "react";

export type AgentToolStatus = "running" | "completed" | "failed";

export interface AgentToolActivity {
  id: string;
  label: string;
  status: AgentToolStatus;
  input?: unknown;
  output?: string | null;
}

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function StatusIcon({ status }: { status: "running" | "error" | "done" }) {
  if (status === "running") {
    return (
      <svg {...iconProps} className="agent-icon agent-icon--spin">
        <path d="M21 12a9 9 0 1 1-6.2-8.56" />
      </svg>
    );
  }
  if (status === "error") {
    return (
      <svg {...iconProps} className="agent-icon agent-icon--error">
        <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }
  return (
    <svg {...iconProps} className="agent-icon">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function StepIcon({ tool }: { tool?: boolean }) {
  return (
    <svg {...iconProps} className="agent-icon">
      {tool ? (
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
      ) : (
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      )}
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg {...iconProps} className="agent-chevron" data-open={open}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

/**
 * 一次运行的过程组：思考、工具与旁白按发生顺序收在同一条时间线里。
 * 运行中默认展开，结束后默认收起；用户手动切换后保持自己的选择。
 */
export function AgentRun({
  running,
  failed = false,
  stepCount,
  label,
  children,
}: {
  running: boolean;
  failed?: boolean;
  stepCount: number;
  label?: string;
  children: ReactNode;
}) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? running;
  const description = running
    ? label
    : stepCount
      ? `${stepCount} 步${failed ? " · 失败" : ""}`
      : undefined;
  return (
    <section className="agent-run" data-status={running ? "running" : failed ? "error" : "done"}>
      <button
        type="button"
        className="agent-run-trigger"
        aria-expanded={open}
        onClick={() => setUserOpen(!open)}
      >
        <StatusIcon status={running ? "running" : failed ? "error" : "done"} />
        <span className="agent-run-title">过程</span>
        {description ? <span className="agent-run-description">{description}</span> : null}
        <Chevron open={open} />
      </button>
      {open ? <div className="agent-run-steps">{children}</div> : null}
    </section>
  );
}

export function AgentThinking({ text, running = false }: { text: string; running?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="agent-thinking"
      data-running={running}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="agent-disclosure">
        {running ? <StatusIcon status="running" /> : <StepIcon />}
        <span className="agent-disclosure-title">思考过程</span>
        {running ? <span className="agent-step-status">执行中</span> : null}
        <Chevron open={open} />
      </summary>
      {open ? <div className="agent-thinking-body">{text}</div> : null}
    </details>
  );
}

export function AgentToolCall({ tool }: { tool: AgentToolActivity }) {
  const [open, setOpen] = useState(false);
  const failed = tool.status === "failed";
  return (
    <details
      className="agent-tool"
      data-status={tool.status}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="agent-disclosure">
        {tool.status === "running" ? <StatusIcon status="running" /> : <StepIcon tool />}
        <span className="agent-disclosure-title">{tool.label}</span>
        <span className="agent-step-status">
          {tool.status === "running" ? "执行中" : failed ? "执行失败" : "完成"}
        </span>
        <Chevron open={open} />
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

export function AgentStepText({ text }: { text: string }) {
  return <p className="agent-step-text">{text}</p>;
}

function formatPayload(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2) ?? String(value);
}
