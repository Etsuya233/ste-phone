import { AgentThinking, AgentToolCall } from "../../../frontend/agent/agent-activity.tsx";
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
        <MapConversationTurnView
          key={turn.id}
          turn={turn}
          progress={turn.status === "running" ? (state.progress ?? null) : null}
        />
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

function MapConversationTurnView({
  turn,
  progress,
}: {
  turn: MapConversationTurn;
  progress: string | null;
}) {
  return (
    <article className="map-turn">
      <p className="map-turn-user">{turn.instruction}</p>
      <div className="map-turn-agent">
        {turn.thinking ? (
          <AgentThinking text={turn.thinking} running={turn.status === "running"} />
        ) : null}
        {turn.tools.map((tool) => (
          <AgentToolCall key={tool.id} tool={tool} />
        ))}
        {turn.status === "running" ? (
          <p className="map-turn-state" aria-live="polite">
            {progress ?? (turn.thinking ? "正在处理…" : "正在思考…")}
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
