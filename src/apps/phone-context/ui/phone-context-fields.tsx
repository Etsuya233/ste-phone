import type { ContextScope } from "../../../core/phone-context/public.ts";
import { TextField } from "../../../frontend/foundation/text-field.tsx";
import { Switch } from "../../../frontend/foundation/switch.tsx";
import { ContextPeople } from "./context-people.tsx";

export interface ContextDraft {
  id: string;
  name: string;
  sourceId: string;
  scopeId: string;
  personIds: readonly string[];
  recentMinutes: string;
  unlimitedTime: boolean;
  limitPerGroup: string;
}

export function PhoneContextFields({
  draft,
  editing,
  busy,
  sources,
  scopes,
  onChange,
  onSource,
}: {
  draft: ContextDraft;
  editing: boolean;
  busy: boolean;
  sources: readonly { id: string; label: string; minimumPeople: number }[];
  scopes: readonly ContextScope[];
  onChange(patch: Partial<ContextDraft>): void;
  onSource(id: string): void;
}) {
  const scope = scopes.find(({ id }) => id === draft.scopeId);
  const source = sources.find(({ id }) => id === draft.sourceId);
  return (
    <>
      <div className="phone-context-fields">
        <TextField
          label="预设名称"
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
        <label className="phone-context-select">
          内容来源
          <select
            aria-label="内容来源"
            value={draft.sourceId}
            disabled={busy}
            onChange={(event) => onSource(event.target.value)}
          >
            {sources.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="phone-context-select">
          资料空间
          <select
            aria-label="资料空间"
            value={draft.scopeId}
            disabled={busy}
            onChange={(event) => onChange({ scopeId: event.target.value, personIds: [] })}
          >
            <option value="" disabled>
              请选择资料空间
            </option>
            {scopes.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="phone-context-note">
        宏标识以小写字母开头，可含数字、下划线或连字符，最长 64 位，保存后固定。显示名称可随时修改。
      </p>
      {source ? (
        <ContextPeople
          scope={scope}
          selected={draft.personIds}
          minimumPeople={source.minimumPeople}
          busy={busy}
          onChange={(personIds) => onChange({ personIds })}
        />
      ) : (
        <p className="phone-context-error" role="alert">
          这个预设的内容来源不可用，请重新选择。
        </p>
      )}
      {scopes.length === 0 ? (
        <p className="phone-context-note">
          还没有可读取的微信人物。请先在当前聊天中保存微信消息，再重新进入此页。
        </p>
      ) : null}
      <div className="phone-context-fields">
        <Switch
          label="不限时间"
          checked={draft.unlimitedTime}
          disabled={busy}
          onCheckedChange={(unlimitedTime) => onChange({ unlimitedTime })}
        />
        {!draft.unlimitedTime ? (
          <TextField
            label="最近多少分钟"
            type="number"
            min="1"
            step="1"
            value={draft.recentMinutes}
            disabled={busy}
            onChange={(event) => onChange({ recentMinutes: event.target.value })}
          />
        ) : null}
        <TextField
          label="每个会话最多消息数"
          type="number"
          min="1"
          step="1"
          value={draft.limitPerGroup}
          disabled={busy}
          onChange={(event) => onChange({ limitPerGroup: event.target.value })}
        />
      </div>
      <p className="phone-context-note">
        使用现实发送时间，先按记忆屏障和时间筛选，再保留最近的指定条数。双方消息共同计数，撤回内容仅显示提示。
      </p>
    </>
  );
}
