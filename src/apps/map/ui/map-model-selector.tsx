import { useId, useState } from "react";
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
  const selectId = useId();
  const [error, setError] = useState<string | null>(null);
  const deleted = model.preferredId !== null && model.selectedId === null;
  const placeholder = model.connections.length
    ? deleted
      ? "原连接已删除，请重新选择"
      : "请选择模型连接"
    : deleted
      ? "原连接已删除，请在设置中添加连接"
      : "请先在设置中添加模型连接";
  return (
    <div className="map-model-selector">
      <label htmlFor={selectId}>模型连接</label>
      <select
        id={selectId}
        value={model.selectedId ?? ""}
        disabled={disabled || !model.connections.length}
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
      {error ? (
        <p className="map-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
