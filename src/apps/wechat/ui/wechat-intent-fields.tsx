import type { WechatIntentScope } from "../wechat-intent.ts";
import { TextField } from "../../../frontend/foundation/text-field.tsx";
import { SelectField } from "../../../frontend/foundation/select-field.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { Switch } from "../../../frontend/foundation/switch.tsx";
import { WechatIntentPeople } from "./wechat-intent-people.tsx";

export interface WechatIntentDraft {
  name: string;
  scopeId: string;
  personIds: readonly string[];
  recentMinutes: string;
  unlimitedTime: boolean;
  limitPerGroup: string;
}

export function WechatIntentFields({
  draft,
  busy,
  scopes,
  onChange,
}: {
  draft: WechatIntentDraft;
  busy: boolean;
  scopes: readonly WechatIntentScope[];
  onChange(patch: Partial<WechatIntentDraft>): void;
}) {
  const scope = scopes.find(({ id }) => id === draft.scopeId);
  return (
    <>
      <GroupedList title="读取方案">
        <TextField
          label="Intent 名称"
          value={draft.name}
          disabled={busy}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <SelectField
          label="资料空间"
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
        </SelectField>
      </GroupedList>
      <WechatIntentPeople
        scope={scope}
        selected={draft.personIds}
        busy={busy}
        onChange={(personIds) => onChange({ personIds })}
      />
      {scopes.length === 0 ? (
        <p className="wechat-intent-note">
          还没有可读取的微信人物。请先在当前聊天中保存微信消息，再重新进入此页。
        </p>
      ) : null}
      <GroupedList
        title="读取范围"
        description="使用现实发送时间，先应用记忆屏障和时间范围，再保留最近的指定条数。双方消息共同计数，撤回只显示提示。"
      >
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
      </GroupedList>
    </>
  );
}
