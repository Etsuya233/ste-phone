import {
  AgentRun,
  AgentStepText,
  AgentThinking,
  AgentToolCall,
} from "../../../frontend/agent/agent-activity.tsx";
import type { MapConversationTurn, MapSnapshot } from "../map.ts";
import type { MapService } from "../map-service.ts";

export function MapAgentConversation({
  service,
  state,
}: {
  service: MapService;
  state: MapSnapshot;
}) {
  return (
    <div className="map-conversation">
      {!state.conversation.length && !state.proposal && !state.error ? (
        <p className="map-agent-intro">
          描述一座城、一座岛，或询问地点与路线。助手可以按需读取全部剧情资料。
        </p>
      ) : null}
      {state.conversation.map((turn) => (
        <MapConversationTurnView key={turn.id} turn={turn} />
      ))}
      {state.proposal ? <MapProposalCard service={service} state={state} /> : null}
      {state.error ? (
        <p className="map-error" role="alert">
          {state.error.message}
        </p>
      ) : null}
    </div>
  );
}

function MapConversationTurnView({ turn }: { turn: MapConversationTurn }) {
  const stepCount = turn.steps.filter((step) => step.kind !== "text").length;
  return (
    <article className="map-turn">
      <p className="map-turn-user">{turn.instruction}</p>
      <div className="map-turn-agent">
        {turn.steps.length ? (
          <AgentRun
            running={turn.status === "running"}
            failed={turn.status === "failed"}
            stepCount={stepCount}
            label={runLabel(turn)}
          >
            {turn.steps.map((step, index) => {
              if (step.kind === "thinking") {
                return (
                  <AgentThinking
                    key={step.id}
                    text={step.text}
                    running={turn.status === "running" && index === turn.steps.length - 1}
                  />
                );
              }
              if (step.kind === "text") {
                return <AgentStepText key={step.id} text={step.text} />;
              }
              return <AgentToolCall key={step.id} tool={step} />;
            })}
          </AgentRun>
        ) : turn.status === "running" ? (
          <p className="map-turn-state" aria-live="polite">
            正在准备…
          </p>
        ) : null}
        {turn.answer ? <p className="map-turn-answer">{turn.answer}</p> : null}
        {turn.error ? (
          <p className="map-error" role="alert">
            {turn.error}
          </p>
        ) : null}
        {turn.status === "cancelled" ? <p className="map-turn-state">已停止</p> : null}
      </div>
    </article>
  );
}

/** 过程组收起时，用最后一个动作给出运行摘要。 */
function runLabel(turn: MapConversationTurn): string | undefined {
  if (turn.status !== "running") {
    return undefined;
  }
  const last = [...turn.steps].reverse().find((step) => step.kind !== "text");
  if (!last) {
    return "正在准备…";
  }
  if (last.kind === "thinking") {
    return "正在思考…";
  }
  if (last.kind === "tool" && last.status === "running") {
    return `正在${last.label}`;
  }
  return "正在整理回答…";
}

function MapProposalCard({ service, state }: { service: MapService; state: MapSnapshot }) {
  const busy = state.status !== "idle";
  return (
    <div className="map-proposal">
      <strong>修改预览</strong>
      <span className="map-caption">金色标出本次影响的要素，确认后保存。</span>
      <div className="map-actions">
        <button className="map-primary" disabled={busy} onClick={() => void service.apply()}>
          应用修改
        </button>
        <button disabled={busy} onClick={() => service.discard()}>
          放弃
        </button>
      </div>
    </div>
  );
}
