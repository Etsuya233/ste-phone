import type { WechatIntentScope } from "../wechat-intent.ts";
import { TextField } from "../../../frontend/foundation/text-field.tsx";
import { SelectField } from "../../../frontend/foundation/select-field.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { Switch } from "../../../frontend/foundation/switch.tsx";
import { WechatIntentChoices } from "./wechat-intent-choices.tsx";

export interface WechatIntentDraft {
  name: string;
  scopeId: string;
  personIds: readonly string[];
  groupIds: readonly string[];
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
          onChange={(event) =>
            onChange({ scopeId: event.target.value, personIds: [], groupIds: [] })
          }
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
      <WechatIntentChoices
        title={`单聊人物 · 已选 ${draft.personIds.length} 人`}
        description="选中双方才读取单聊，与当前微信帐号无关。"
        choices={scope?.people ?? []}
        selected={draft.personIds}
        busy={busy}
        onChange={(personIds) => onChange({ personIds })}
      />
      <WechatIntentChoices
        title={`群聊 · 已选 ${draft.groupIds.length} 个`}
        description="只读取勾选的群聊。仅选择群聊时，可以不选单聊人物。"
        choices={scope?.groups ?? []}
        selected={draft.groupIds}
        busy={busy}
        onChange={(groupIds) => onChange({ groupIds })}
      />
      {scopes.length === 0 ? (
        <p className="wechat-intent-note">
          还没有可读取的微信会话。请先在当前聊天中保存微信消息或创建群聊，再重新进入此页。
        </p>
      ) : null}
      <GroupedList
        title="读取范围"
        description="先应用记忆屏障与现实时间范围，再保留每个会话最近的指定条数。系统消息也计数，撤回只显示提示。"
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
