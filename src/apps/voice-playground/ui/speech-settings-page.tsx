import { useState } from "react";
import type { PhoneSettingsService } from "../../settings/public.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import {
  defaultSpeechConnection,
  validateSpeechConnection,
  voiceNames,
  type SpeechTransport,
} from "../../../core/speech/public.ts";
import { useSpeechPreview } from "./use-speech-preview.ts";
import { VoiceControls } from "./voice-controls.tsx";
import { VoicePlayer } from "./voice-player.tsx";

export function SpeechSettingsPage({
  settings,
  transport,
  active,
  onBack,
}: {
  settings: PhoneSettingsService;
  transport: SpeechTransport;
  active: boolean;
  onBack: () => void;
}) {
  const [draft, setDraft] = useState(
    () => settings.getState().speechConnection ?? defaultSpeechConnection,
  );
  const [notice, setNotice] = useState("");
  const { preview, generate, cancel } = useSpeechPreview(transport);

  function submit(test: boolean) {
    setNotice("");
    const connection = {
      ...draft,
      endpoint: draft.endpoint.trim(),
      model: draft.model.trim(),
      apiKey: draft.apiKey?.trim(),
    };
    try {
      validateSpeechConnection(connection);
      if (test) {
        void generate(connection, "你好，这里是声乐园。");
      } else {
        settings.saveSpeechConnection(connection);
        setNotice("语音连接已保存");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <Page
      className="voice-page"
      navBar={
        <NavBar
          title="语音连接"
          back={{ label: "设置", onClick: onBack }}
          right={<Button onClick={() => submit(false)}>保存</Button>}
        />
      }
    >
      <div className="voice-studio voice-fields">
        <label>
          Speech 接口
          <input
            type="url"
            placeholder="https://example.com/v1/audio/speech"
            value={draft.endpoint}
            onChange={(event) => setDraft({ ...draft, endpoint: event.target.value })}
          />
        </label>
        <label>
          模型
          <input
            value={draft.model}
            onChange={(event) => setDraft({ ...draft, model: event.target.value })}
          />
        </label>
        <label>
          可用音色（逗号分隔）
          <input
            value={draft.voices}
            onChange={(event) => {
              const voices = event.target.value;
              const names = voiceNames(voices);
              setDraft({
                ...draft,
                voices,
                voice: names.includes(draft.voice) ? draft.voice : (names[0] ?? ""),
              });
            }}
          />
        </label>
        <label>
          语音 API Key
          <input
            type="password"
            autoComplete="new-password"
            value={draft.apiKey ?? ""}
            onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
          />
        </label>
        <p>适配器使用 BRIDGE_TOKEN。密钥随手机语音连接保存。</p>
        <VoiceControls
          options={draft}
          voices={voiceNames(draft.voices)}
          onChange={(change) => setDraft((previous) => ({ ...previous, ...change }))}
        />
        {preview.status === "pending" ? (
          <Button onClick={cancel}>停止等待</Button>
        ) : (
          <Button onClick={() => submit(true)}>测试并试听</Button>
        )}
        {notice && <p role="status">{notice}</p>}
        {preview.status === "error" && <p role="alert">{preview.message}</p>}
        {preview.status === "ready" && (
          <VoicePlayer url={preview.url} active={active} options={draft} />
        )}
      </div>
    </Page>
  );
}
