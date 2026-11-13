import { useState, useSyncExternalStore } from "react";
import { Button, NavBar, Page, SelectField } from "../../../frontend/foundation/foundation.tsx";
import type { BrowserModelPreference, ModelConnectionsReader } from "../../settings/public.ts";
import { BrowserSparkleIcon } from "./browser-icons.tsx";

export interface BrowserModels {
  connections: ModelConnectionsReader;
  preference: BrowserModelPreference;
  onSettings: () => void;
}

/** 已删除的连接仍可能留在偏好里，调用方统一按“未选择”处理。 */
export function useBrowserModel(models: BrowserModels) {
  const { connections } = useSyncExternalStore(
    models.connections.subscribe,
    models.connections.getSnapshot,
  );
  const preferred = useSyncExternalStore(
    models.preference.subscribe,
    models.preference.getSnapshot,
  );
  return {
    connections,
    preferred,
    connection: connections.find(({ id }) => id === preferred) ?? null,
  };
}

export function BrowserModelPicker({
  models,
  label = "创作模型",
}: {
  models: BrowserModels;
  label?: string;
}) {
  const { connections, preferred, connection } = useBrowserModel(models);
  const [error, setError] = useState("");
  const placeholder = connections.length
    ? preferred
      ? "原连接已删除，请重新选择"
      : "选择一个模型连接"
    : "尚未添加连接";
  return (
    <div className="browser-model-picker">
      <SelectField
        label={label}
        value={connection?.id ?? ""}
        disabled={!connections.length}
        onChange={(event) => {
          try {
            models.preference.select(event.target.value);
            setError("");
          } catch (cause) {
            setError((cause as Error).message);
          }
        }}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {connections.map(({ id, name, model }) => (
          <option key={id} value={id}>
            {name} · {model}
          </option>
        ))}
      </SelectField>
      {!connections.length ? (
        <Button className="browser-model-open" onClick={models.onSettings}>
          打开设置添加模型连接
        </Button>
      ) : null}
      {error ? (
        <p className="browser-model-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function BrowserModelPage({
  models,
  onBack,
}: {
  models: BrowserModels;
  onBack: () => void;
}) {
  return (
    <Page
      className="browser-page browser-models-page"
      largeTitle="模型"
      navBar={<NavBar title="模型" back={{ label: "作品", onClick: onBack }} />}
    >
      <section className="browser-models">
        <div className="browser-model-intro">
          <span className="browser-model-intro-mark" aria-hidden="true">
            <BrowserSparkleIcon />
          </span>
          <div>
            <h2>浏览器专用模型</h2>
            <p>只用于生成和修改网页作品，不改变其他应用的选择。</p>
          </div>
        </div>
        <div className="browser-model-card">
          <BrowserModelPicker models={models} />
        </div>
        <p className="browser-model-footnote">
          每次创作开始时固定使用当时的连接；修改选择不会打断正在进行或已经保存的作品。
        </p>
      </section>
    </Page>
  );
}
