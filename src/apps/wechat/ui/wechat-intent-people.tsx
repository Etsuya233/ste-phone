import type { WechatIntentScope } from "../wechat-intent.ts";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";

export function WechatIntentPeople({
  scope,
  selected,
  busy,
  onChange,
}: {
  scope: WechatIntentScope | undefined;
  selected: readonly string[];
  busy: boolean;
  onChange(ids: readonly string[]): void;
}) {
  const missing = selected.filter((id) => !scope?.people.some((person) => person.id === id));
  return (
    <GroupedList
      title={`人物 · 已选 ${selected.length} 人`}
      description="至少选择 2 人，只读取参与双方均被选中的会话，与当前微信帐号无关。"
    >
      {scope?.people.map((person) => (
        <ListCell
          key={person.id}
          title={
            <label className="wechat-intent-person">
              <input
                type="checkbox"
                checked={selected.includes(person.id)}
                disabled={busy}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, person.id]
                      : selected.filter((id) => id !== person.id),
                  )
                }
              />
              <span>
                {person.name}
                {scope.people.some(
                  (other) => other.id !== person.id && other.name === person.name,
                ) ? (
                  <small className="wechat-intent-person-id">{person.id}</small>
                ) : null}
              </span>
              <span className="wechat-intent-check" aria-hidden="true">
                ✓
              </span>
            </label>
          }
        />
      ))}
      {missing.map((id) => (
        <ListCell
          key={id}
          title={
            <label className="wechat-intent-person">
              <input
                type="checkbox"
                checked
                disabled={busy}
                onChange={() => onChange(selected.filter((personId) => personId !== id))}
              />
              <span>已不在当前列表：{id}</span>
              <span className="wechat-intent-check" aria-hidden="true">
                ✓
              </span>
            </label>
          }
        />
      ))}
    </GroupedList>
  );
}
