import { useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import { publicCampusOwners } from "../campus-accounts.ts";
import { CampusPage, type CampusPageProps } from "./campus-page.tsx";

export function CampusCreateAccounts(props: CampusPageProps) {
  const { service, state, navigation } = props;
  const [selection, setSelection] = useState<string[]>([]);
  const [created, setCreated] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const existing = publicCampusOwners(state.data.accounts);
  const eligible = state.authors.filter(({ id }) => !existing.has(id));
  const keyword = query.trim().toLocaleLowerCase();
  const visible = state.authors.filter(
    ({ id, name }) =>
      name.toLocaleLowerCase().includes(keyword) || id.toLocaleLowerCase().includes(keyword),
  );
  const selectable = visible.filter(({ id }) => !existing.has(id));
  // 最新人物与账号决定有效选择，已移除或已有公开账号的人物不会随旧选择提交。
  const selected = eligible.filter(({ id }) => selection.includes(id)).map(({ id }) => id);
  const allSelected = selectable.length > 0 && selectable.every(({ id }) => selected.includes(id));
  const busy = state.phase !== "idle" || !state.scopeKey || !state.authorsReady;
  const nameCounts = new Map<string, number>();
  for (const { name } of state.authors) {
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }

  async function create() {
    if (busy || !selected.length) {
      return;
    }
    const priorCount = service.getSnapshot().data.accounts.length;
    const saved = await service.command({
      type: "create-accounts",
      authorIds: selected,
      scopeKey: state.scopeKey!,
    });
    // 保存失败留在本页并保留选择，错误由共享反馈区展示。
    if (saved && service.getSnapshot().scopeKey === state.scopeKey) {
      setCreated(service.getSnapshot().data.accounts.length - priorCount);
      setSelection([]);
    }
  }

  return (
    <CampusPage
      {...props}
      title="批量创建角色账号"
      back={navigation.pop}
      footer={
        <div className="campus-row campus-bulk-footer">
          <span>已选 {selected.length} 人</span>
          <Button
            variant="filled"
            disabled={busy || !selected.length}
            onClick={() => void create()}
          >
            创建 {selected.length} 个账号
          </Button>
        </div>
      }
    >
      <section className="campus-section">
        <p>使用人物原名创建公开账号。已有公开账号的人物无需重复创建。</p>
        {created !== null ? <p role="status">已创建 {created} 个账号。</p> : null}
        <Button
          disabled={busy || !selectable.length}
          onClick={() =>
            setSelection((previous) =>
              allSelected
                ? previous.filter((id) => !selectable.some((author) => author.id === id))
                : [...new Set([...previous, ...selectable.map(({ id }) => id)])],
            )
          }
        >
          {allSelected ? "取消全选" : "全选"}
        </Button>
        <input
          type="search"
          className="campus-search-input"
          aria-label="搜索人物"
          placeholder="搜索人物"
          value={query}
          disabled={busy}
          onChange={(event) => setQuery(event.target.value)}
        />
        {!state.authorsReady ? <p>正在读取人物资料…</p> : null}
        {state.authorsReady && !state.authors.length ? <p>当前资料中没有人物。</p> : null}
        {state.authorsReady && state.authors.length && !visible.length ? (
          <p>没有匹配的人物。</p>
        ) : null}
        {visible.map(({ id, name }) => (
          <label className="campus-bulk-person" key={id}>
            <input
              type="checkbox"
              checked={selected.includes(id)}
              disabled={busy || existing.has(id)}
              onChange={(event) =>
                setSelection(
                  event.target.checked
                    ? [...selected, id]
                    : selected.filter((value) => value !== id),
                )
              }
            />
            <span>
              <strong>{name}</strong>
              {nameCounts.get(name)! > 1 ? <small className="campus-meta">身份：{id}</small> : null}
              {existing.has(id) ? <small className="campus-meta">已有账号</small> : null}
            </span>
          </label>
        ))}
      </section>
    </CampusPage>
  );
}
