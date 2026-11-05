import { useEffect, useRef, useState } from "react";
import type { MapPoint, MapSnapshot } from "../map.ts";
import type { MapService } from "../map-service.ts";
import { MapAgentComposer } from "./map-agent-composer.tsx";
import { MapAgentConversation } from "./map-agent-conversation.tsx";
import type { MapModelOptions } from "./map-model-selector.tsx";
import type { AgentSheetSize, useAgentSheet } from "./use-agent-sheet.ts";

type AgentSheet = ReturnType<typeof useAgentSheet>;

export function MapAgentPanel({
  service,
  state,
  model,
  sheet,
  selectedId,
  selectedName,
  selectedPoint,
  onClearPoint,
  onClearSelection,
}: {
  service: MapService;
  state: MapSnapshot;
  model: MapModelOptions;
  sheet: AgentSheet;
  selectedId: string | null;
  selectedName: string | null;
  selectedPoint: MapPoint | null;
  onClearPoint: () => void;
  onClearSelection: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const busy = state.status !== "idle";
  const canRequest = model.selectedId !== null;

  useEffect(() => {
    const element = body.current;
    if (element && follow.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [state.conversation, state.proposal, state.error]);

  const submit = () => {
    if (!instruction.trim() || busy || !canRequest) {
      return;
    }
    setInstruction("");
    void service.request({
      instruction,
      selectedId: selectedId ?? undefined,
      selectedPoint: selectedPoint ?? undefined,
    });
  };
  const startNewConversation = () => {
    service.newConversation();
    onClearSelection();
    setInstruction("");
    follow.current = true;
  };

  return (
    <section
      ref={sheet.panelRef}
      className="map-agent"
      aria-label="地图助手"
      data-size={sheet.size}
      data-dragging={sheet.height !== null}
    >
      <MapAgentHeader
        state={state}
        size={sheet.size}
        onNewConversation={startNewConversation}
        onToggleSize={sheet.toggleFull}
        handlers={sheet.handlers}
      />
      <div
        className="map-agent-body"
        ref={body}
        onScroll={() => {
          const element = body.current;
          if (element) {
            follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40;
          }
        }}
      >
        <MapAgentConversation service={service} state={state} />
      </div>
      <MapAgentComposer
        service={service}
        state={state}
        model={model}
        selectedName={selectedName}
        selectedPoint={selectedPoint}
        instruction={instruction}
        onInstruction={setInstruction}
        onSubmit={submit}
        onClearPoint={onClearPoint}
      />
    </section>
  );
}

function MapAgentHeader({
  state,
  size,
  onNewConversation,
  onToggleSize,
  handlers,
}: {
  state: MapSnapshot;
  size: AgentSheetSize;
  onNewConversation: () => void;
  onToggleSize: () => void;
  handlers: AgentSheet["handlers"];
}) {
  return (
    <header className="map-agent-header" {...handlers}>
      <span className="map-agent-grip" aria-hidden="true" />
      <div className="map-agent-heading">
        <strong>地图助手</strong>
        <span className="map-agent-state">{agentStatus(state)}</span>
      </div>
      <div className="map-agent-header-actions">
        <button
          type="button"
          aria-label="新对话"
          disabled={state.status === "saving"}
          onClick={onNewConversation}
        >
          新对话
        </button>
        <button type="button" onClick={onToggleSize}>
          {size === "full" ? "收起" : size === "collapsed" ? "展开" : "全屏"}
        </button>
      </div>
    </header>
  );
}

function agentStatus(state: MapSnapshot): string {
  if (state.status === "reading") {
    return "读取资料中…";
  }
  if (state.status === "generating") {
    return state.progress ?? "正在构思…";
  }
  if (state.status === "saving") {
    return "保存中…";
  }
  if (state.error) {
    return state.error.message;
  }
  const last = state.conversation.at(-1);
  if (last?.status === "failed") {
    return "上次任务失败";
  }
  if (last?.status === "cancelled") {
    return "已停止";
  }
  if (state.proposal) {
    return "有待确认的修改";
  }
  return state.conversation.length ? "已完成" : "描述世界或询问地图";
}
