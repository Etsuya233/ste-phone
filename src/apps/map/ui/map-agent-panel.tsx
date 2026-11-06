import { useEffect, useRef, useState } from "react";
import type { MapDocument, MapFeature, MapPoint, MapSnapshot } from "../map.ts";
import type { MapService } from "../map-service.ts";
import { MapAgentComposer } from "./map-agent-composer.tsx";
import { MapAgentConversation } from "./map-agent-conversation.tsx";
import { MapFeatureDetails } from "./map-browser.tsx";
import type { MapModelOptions } from "./map-model-selector.tsx";
import type { AgentSheetSize, useAgentSheet } from "./use-agent-sheet.ts";

type AgentSheet = ReturnType<typeof useAgentSheet>;

export function MapAgentPanel({
  service,
  state,
  document,
  model,
  sheet,
  selected,
  detailsOpen,
  selectedPoint,
  onClearPoint,
  onClearSelection,
  onCloseDetails,
}: {
  service: MapService;
  state: MapSnapshot;
  document: MapDocument;
  model: MapModelOptions;
  sheet: AgentSheet;
  selected: MapFeature | null;
  detailsOpen: boolean;
  selectedPoint: MapPoint | null;
  onClearPoint: () => void;
  onClearSelection: () => void;
  onCloseDetails: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const body = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const busy = state.status !== "idle";
  const canRequest = model.selectedId !== null;
  const selectedKey = selected?.id ?? null;

  useEffect(() => {
    if (detailsOpen) {
      return;
    }
    const element = body.current;
    if (!element) {
      return;
    }
    const hasContent =
      state.conversation.length > 0 || state.proposal !== null || state.error !== null;
    if (!hasContent) {
      element.scrollTop = 0;
      return;
    }
    if (follow.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [state.conversation, state.proposal, state.error, detailsOpen]);

  useEffect(() => {
    if (detailsOpen && selectedKey && body.current) {
      body.current.scrollTop = 0;
    }
  }, [detailsOpen, selectedKey]);

  const submit = () => {
    if (!instruction.trim() || busy || !canRequest) {
      return;
    }
    setInstruction("");
    void service.request({
      instruction,
      selectedId: selectedKey ?? undefined,
      selectedPoint: selectedPoint ?? undefined,
    });
  };
  const startNewConversation = () => {
    if (!service.newConversation()) {
      return;
    }
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
        detailsOpen={detailsOpen}
        size={sheet.size}
        onNewConversation={startNewConversation}
        onToggleSize={sheet.toggleFull}
        onStop={() => service.cancel()}
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
        {detailsOpen && selected ? (
          <MapFeatureDetails feature={selected} document={document} onClose={onCloseDetails} />
        ) : (
          <MapAgentConversation service={service} state={state} />
        )}
      </div>
      {detailsOpen && selected ? null : (
        <MapAgentComposer
          service={service}
          state={state}
          model={model}
          selectedName={selected?.name ?? null}
          selectedPoint={selectedPoint}
          instruction={instruction}
          onInstruction={setInstruction}
          onSubmit={submit}
          onClearPoint={onClearPoint}
          onClearSelection={onClearSelection}
        />
      )}
    </section>
  );
}

function MapAgentHeader({
  state,
  detailsOpen,
  size,
  onNewConversation,
  onToggleSize,
  onStop,
  handlers,
}: {
  state: MapSnapshot;
  detailsOpen: boolean;
  size: AgentSheetSize;
  onNewConversation: () => void;
  onToggleSize: () => void;
  onStop: () => void;
  handlers: AgentSheet["handlers"];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const busy = state.status !== "idle";
  const canStop = state.status === "reading" || state.status === "generating";
  const detailLabel = detailsOpen && !busy;

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    item.current?.focus();
    const dismiss = (event: PointerEvent) => {
      const node = menu.current;
      if (node && !event.composedPath().includes(node)) {
        setMenuOpen(false);
      }
    };
    globalThis.document.addEventListener("pointerdown", dismiss, true);
    return () => globalThis.document.removeEventListener("pointerdown", dismiss, true);
  }, [menuOpen]);

  useEffect(() => {
    if (busy) {
      setMenuOpen(false);
    }
  }, [busy]);

  const closeMenu = () => {
    setMenuOpen(false);
    more.current?.focus();
  };

  return (
    <header className="map-agent-header" {...handlers}>
      <span className="map-agent-grip" aria-hidden="true" />
      <div className="map-agent-heading">
        <strong>地图助手</strong>
        <span className="map-agent-state" data-status={detailLabel ? "detail" : agentTone(state)}>
          <span>{detailLabel ? "地点详情" : agentStatus(state)}</span>
        </span>
      </div>
      <div className="map-agent-header-actions">
        {canStop ? (
          <button type="button" className="map-agent-stop" onClick={onStop}>
            停止
          </button>
        ) : null}
        <button type="button" onClick={onToggleSize}>
          {size === "full" ? "收起" : size === "collapsed" ? "展开" : "全屏"}
        </button>
        {busy ? null : (
          <div className="map-agent-more" ref={menu}>
            <button
              ref={more}
              type="button"
              aria-label="更多操作"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              ⋯
            </button>
            {menuOpen ? (
              <div
                className="map-agent-menu"
                role="menu"
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    closeMenu();
                  }
                }}
              >
                <button
                  ref={item}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    closeMenu();
                    onNewConversation();
                  }}
                >
                  新对话
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </header>
  );
}

function agentTone(state: MapSnapshot): "idle" | "busy" | "pending" | "error" {
  const last = state.conversation.at(-1);
  if (state.error || last?.status === "failed") {
    return "error";
  }
  if (state.proposal) {
    return "pending";
  }
  return state.status === "idle" ? "idle" : "busy";
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
