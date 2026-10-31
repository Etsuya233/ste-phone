import { useState } from "react";
import type { DiarySettings } from "../diary.ts";
import type { DiaryService } from "../diary-service.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { TextField } from "../../../frontend/foundation/text-field.tsx";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";

export function DiarySettingsPage({ diary, state, navigation }: DiaryPageProps) {
  return (
    <DiaryPage state={state} title="写作设置" onBack={navigation.pop} backLabel="返回">
      <div className="diary-settings">
        <p className="diary-settings-intro">
          这些参数只影响下一次落笔，已经收进日记本的页面不会被改写。
        </p>
        <GenerationSettings diary={diary} settings={state.data.settings} onBack={navigation.pop} />
      </div>
    </DiaryPage>
  );
}

function GenerationSettings({
  diary,
  settings,
  onBack,
}: {
  diary: DiaryService;
  settings: DiarySettings;
  onBack: () => void;
}) {
  const [timeout, setTimeout] = useState(String(settings.timeoutSeconds));
  const [tokens, setTokens] = useState(String(settings.maxTokens));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await diary.saveSettings({ timeoutSeconds: Number(timeout), maxTokens: Number(tokens) });
      onBack();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)}>
      <GroupedList
        title="模型生成"
        description="篇幅由人物和材料自然发挥，输出上限只约束模型请求。"
      >
        <TextField
          label="总超时（秒）"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          value={timeout}
          onChange={(event) => setTimeout(event.target.value)}
        />
        <TextField
          label="输出上限（token）"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          required
          value={tokens}
          onChange={(event) => setTokens(event.target.value)}
        />
      </GroupedList>
      {error ? (
        <p className="diary-message diary-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="diary-write-actions">
        <Button type="submit" variant="filled" disabled={saving}>
          {saving ? "正在保存…" : "保存设置"}
        </Button>
      </div>
    </form>
  );
}
