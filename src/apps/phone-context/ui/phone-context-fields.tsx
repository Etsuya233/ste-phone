import { TextField } from "../../../frontend/foundation/text-field.tsx";
import { SelectField } from "../../../frontend/foundation/select-field.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";

export interface ContextDraft {
  id: string;
  name: string;
  sourceId: string;
  intentId: string;
}

export function PhoneContextFields({
  draft,
  editing,
  busy,
  sources,
  intents,
  onChange,
  onSource,
}: {
  draft: ContextDraft;
  editing: boolean;
  busy: boolean;
  sources: readonly { id: string; label: string }[];
  intents: readonly { id: string; name: string }[];
  onChange(patch: Partial<ContextDraft>): void;
  onSource(id: string): void;
}) {
  return (
    <>
      <GroupedList
        title="宏定义"
        description="宏标识以小写字母开头，可含数字、下划线或连字符，最长 64 位，保存后固定。"
      >
        <TextField
          label="绑定名称"
          value={draft.name}
          disabled={busy}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <TextField
          label="宏标识"
          value={draft.id}
          disabled={editing || busy}
          placeholder="wechat_recent"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => onChange({ id: event.target.value })}
        />
      </GroupedList>
      <GroupedList
        title="引用方案"
        description="读取条件在各应用内配置。微信入口为「我 → 设置 → App Intent」。"
      >
        <SelectField
          label="应用"
          value={draft.sourceId}
          disabled={busy}
          onChange={(event) => onSource(event.target.value)}
        >
          {!sources.some(({ id }) => id === draft.sourceId) ? (
            <option value={draft.sourceId} disabled>
              应用不可用
            </option>
          ) : null}
          {sources.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="App Intent"
          value={draft.intentId}
          disabled={busy}
          onChange={(event) => onChange({ intentId: event.target.value })}
        >
          <option value="" disabled>
            请选择 App Intent
          </option>
          {draft.intentId && !intents.some(({ id }) => id === draft.intentId) ? (
            <option value={draft.intentId} disabled>
              原 App Intent 已不存在
            </option>
          ) : null}
          {intents.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
              {intents.some((other) => other.id !== id && other.name === name) ? ` (${id})` : ""}
            </option>
          ))}
        </SelectField>
      </GroupedList>
      {intents.length === 0 ? (
        <p className="phone-context-note">当前应用还没有可引用的 App Intent，请先在应用内创建。</p>
      ) : null}
    </>
  );
}
