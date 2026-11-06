import { useState } from "react";
import type { ModelConnectionSummary } from "../../settings/public.ts";
import type { MapService } from "../map-service.ts";

export interface MapModelOptions {
  connections: readonly ModelConnectionSummary[];
  preferredId: string | null;
  selectedId: string | null;
}

export function MapModelSelector({
  model,
  service,
  disabled,
}: {
  model: MapModelOptions;
  service: MapService;
  disabled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const deleted = model.preferredId !== null && model.selectedId === null;
  const placeholder = model.connections.length
    ? deleted
      ? "原连接已删除，请重新选择"
      : "请选择模型连接"
    : deleted
      ? "原连接已删除，请在设置中添加连接"
      : "请先在设置中添加模型连接";
  const selected = model.connections.find((connection) => connection.id === model.selectedId);
  const unavailable = disabled || !model.connections.length;
  return (
    <>
      <div className="map-model-selector" data-disabled={unavailable}>
        <span className="map-model-chip" aria-hidden="true">
          <span>{selected ? `${selected.name} · ${selected.model}` : placeholder}</span>
          <svg viewBox="0 0 10 10">
            <path d="m2 3.5 3 3 3-3" />
          </svg>
        </span>
        <select
          aria-label="模型连接"
          value={model.selectedId ?? ""}
          disabled={unavailable}
          onChange={(event) => {
            try {
              service.selectModel(event.target.value);
              setError(null);
            } catch (cause) {
              setError(`无法保存模型连接：${(cause as Error).message}`);
            }
          }}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {model.connections.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.name} · {connection.model}
            </option>
          ))}
        </select>
      </div>
      {error ? (
        <p className="map-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
