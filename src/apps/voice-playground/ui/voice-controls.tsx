import { Switch } from "../../../frontend/foundation/switch.tsx";
import type { VoiceOptions } from "../../../core/speech/public.ts";

export function VoiceControls({
  options,
  voices,
  onChange,
}: {
  options: VoiceOptions;
  voices: string[];
  onChange: (change: Partial<VoiceOptions>) => void;
}) {
  return (
    <div className="voice-fields">
      <label>
        朗读风格
        <textarea
          rows={2}
          maxLength={1000}
          value={options.instructions ?? ""}
          placeholder="例如：压低声音，放慢停顿"
          onChange={(event) => onChange({ instructions: event.target.value })}
        />
      </label>
      <label>
        音色
        <select value={options.voice} onChange={(event) => onChange({ voice: event.target.value })}>
          {voices.map((voice) => (
            <option key={voice}>{voice}</option>
          ))}
        </select>
      </label>
      <label>
        合成语速 <output>{options.speed.toFixed(2)}×</output>
        <input
          type="range"
          min="0.25"
          max="4"
          step="0.05"
          value={options.speed}
          onChange={(event) => onChange({ speed: event.target.valueAsNumber })}
        />
      </label>
      <label>
        播放速度 <output>{options.playbackRate.toFixed(2)}×</output>
        <input
          type="range"
          min="0.5"
          max="2"
          step="0.05"
          value={options.playbackRate}
          onChange={(event) => onChange({ playbackRate: event.target.valueAsNumber })}
        />
      </label>
      <label>
        音量 <output>{Math.round(options.volume * 100)}%</output>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={options.volume}
          onChange={(event) => onChange({ volume: event.target.valueAsNumber })}
        />
      </label>
      <Switch
        label="变速时保留音高"
        checked={options.preservePitch}
        onCheckedChange={(preservePitch) => onChange({ preservePitch })}
      />
    </div>
  );
}
