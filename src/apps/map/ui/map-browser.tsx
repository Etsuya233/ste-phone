import { useEffect, useRef, type RefObject } from "react";
import type { MapDocument, MapFeature } from "../map.ts";

const featureKinds = { place: "地点", region: "区域", road: "道路" };

export function MapSearch({
  document,
  query,
  open,
  inputRef,
  onQuery,
  onOpen,
  onClose,
  onCancel,
  onSelect,
}: {
  document: MapDocument;
  query: string;
  open: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  onQuery: (value: string) => void;
  onOpen: () => void;
  onClose: () => void;
  onCancel: () => void;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const matches = document.features.filter((feature) =>
    [feature.name, ...feature.aliases, feature.description].some((text) =>
      text.toLocaleLowerCase().includes(normalized),
    ),
  );
  // 点按结果时输入框会先失焦，用指针目标判断是否在搜索区内，避免结果在 click 前被移除。
  useEffect(() => {
    if (!open) {
      return;
    }
    const dismiss = (event: PointerEvent) => {
      // Shadow DOM 外的监听点只能拿到宿主节点，用 composedPath 判断真实目标。
      const node = container.current;
      if (node && !event.composedPath().includes(node)) {
        onClose();
      }
    };
    globalThis.document.addEventListener("pointerdown", dismiss, true);
    return () => globalThis.document.removeEventListener("pointerdown", dismiss, true);
  }, [open, onClose]);
  return (
    <div className="map-search" ref={container}>
      <div className="map-search-field" onClick={() => inputRef.current?.focus()}>
        <svg className="map-search-icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="7" cy="7" r="4.4" />
          <path d="m10.3 10.3 3.4 3.4" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          aria-label="搜索地图"
          placeholder={document.title}
          value={query}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          onFocus={onOpen}
          onChange={(event) => onQuery(event.target.value)}
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (next && !container.current?.contains(next)) {
              onClose();
            }
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === "Enter" && normalized) {
              const first = matches[0];
              if (first) {
                event.preventDefault();
                onSelect(first.id);
              }
            } else if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className="map-search-clear"
            aria-label="清空搜索"
            onClick={() => onQuery("")}
          >
            ×
          </button>
        ) : null}
      </div>
      {open ? (
        <button type="button" className="map-search-cancel" onClick={onCancel}>
          取消
        </button>
      ) : null}
      {open && normalized ? (
        <div className="map-search-results" aria-label="搜索结果">
          {matches.length ? (
            matches.map((feature) => (
              <button key={feature.id} type="button" onClick={() => onSelect(feature.id)}>
                <strong>{feature.name}</strong>
                <span>
                  {featureKinds[feature.kind]}
                  {feature.geometry ? "" : " · 位置待定"}
                </span>
              </button>
            ))
          ) : (
            <p>没有找到相关地点</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function MapFeatureDetails({
  feature,
  document,
  onClose,
}: {
  feature: MapFeature;
  document: MapDocument;
  onClose: () => void;
}) {
  const events = document.events.filter((event) => event.placeIds.includes(feature.id));
  return (
    <section className="map-feature-details" aria-label="地图详情">
      <header>
        <div>
          <span className="map-caption">
            {featureKinds[feature.kind]}
            {feature.geometry ? "" : " · 位置待定"}
          </span>
          <h2>{feature.name}</h2>
        </div>
        <button aria-label="取消选择" onClick={onClose}>
          ×
        </button>
      </header>
      <p>{feature.description}</p>
      {feature.cartography?.density ? (
        <p className="map-caption">背景楼块与绿化为示意，仅用于辅助阅读地图。</p>
      ) : null}
      {feature.aliases.length ? (
        <p className="map-caption">别名：{feature.aliases.join("、")}</p>
      ) : null}
      <p className="map-caption">来源：{feature.source}</p>
      {events.map((event) => (
        <div className="map-event" key={event.id}>
          <strong>{event.title}</strong>
          <span>{event.storyTime ?? "剧情时间未知"}</span>
          <p>{event.description}</p>
          <small>来源：{event.source}</small>
        </div>
      ))}
    </section>
  );
}
