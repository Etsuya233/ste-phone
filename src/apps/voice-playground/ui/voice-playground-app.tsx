import { useState, useSyncExternalStore } from "react";
import type { PhoneSettingsService } from "../../settings/public.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import {
  voiceNames,
  type SpeechTransport,
  type VoiceOptions,
} from "../../../core/speech/public.ts";
import { useSpeechPreview } from "./use-speech-preview.ts";
import { VoiceControls } from "./voice-controls.tsx";
import { VoicePlayer } from "./voice-player.tsx";

export function VoicePlaygroundApp({
  settings,
  transport,
  active,
  onHome,
  onSettings,
}: {
  settings: PhoneSettingsService;
  transport: SpeechTransport;
  active: boolean;
  onHome: () => void;
  onSettings: () => void;
}) {
  const connection = useSyncExternalStore(
    settings.subscribe,
    () => settings.getState().speechConnection,
  );
  const [text, setText] = useState("");
  const [overrides, setOverrides] = useState<Partial<VoiceOptions>>({});
  const { preview, generate, cancel } = useSpeechPreview(transport);
  const voices = connection ? voiceNames(connection.voices) : [];
  const options = connection
    ? {
        ...connection,
        ...overrides,
        voice:
          overrides.voice && voices.includes(overrides.voice) ? overrides.voice : connection.voice,
      }
    : null;

  return (
    <Page
      className="voice-page"
      navBar={
        <NavBar
          title="声乐园"
          back={{ label: "主屏幕", onClick: onHome }}
          right={<Button onClick={onSettings}>设置</Button>}
        />
      }
    >
      <div className="voice-studio">
        <div className="voice-reel">
          <svg viewBox="0 0 100 36" aria-hidden="true">
            <path d="M6 18h8m6-4v8m6-13v18m6-24v30m6-24v18m6-13v8m6-9v10m6-15v20m6-25v30m6-23v16m6-12v8m6-4h14" />
          </svg>
          <span>
            {preview.status === "pending"
              ? "合成中"
              : preview.status === "ready"
                ? "试听"
                : "配音台"}
          </span>
        </div>
        {!options ? (
          <p>请先在「设置 → 语音连接」配置 Speech API。</p>
        ) : (
          <>
            <label className="voice-script">
              台词 <output>{Array.from(text).length} / 4096</output>
              <textarea
                maxLength={4096}
                rows={4}
                value={text}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <details open>
              <summary>本次声音设置</summary>
              <VoiceControls
                options={options}
                voices={voices}
                onChange={(change) => setOverrides((previous) => ({ ...previous, ...change }))}
              />
              <Button disabled={!Object.keys(overrides).length} onClick={() => setOverrides({})}>
                恢复默认
              </Button>
            </details>
            {preview.status === "pending" ? (
              <Button onClick={cancel}>停止等待</Button>
            ) : (
              <Button disabled={!text.trim()} onClick={() => void generate(options, text)}>
                生成语音
              </Button>
            )}
            {preview.status === "error" && <p role="alert">{preview.message}</p>}
            {preview.status === "ready" && (
              <div className="voice-result">
                <p>
                  {preview.voice} · 合成语速 {preview.speed.toFixed(2)}×
                </p>
                <VoicePlayer url={preview.url} active={active} options={options} />
                <a href={preview.url} download={`声乐园.${preview.format}`}>
                  下载 {preview.format.toUpperCase()}
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
