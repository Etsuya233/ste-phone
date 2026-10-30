import { NavigationStack } from "../../foundation/navigation-stack.tsx";
import type { Navigation } from "../../foundation/navigation-stack.tsx";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PhoneDatabaseService } from "../../../features/database/index.ts";
import { quoteIdentifier } from "../../../features/database/index.ts";
import { Button } from "../../foundation/button.tsx";
import { GroupedList } from "../../foundation/grouped-list.tsx";
import { ListCell } from "../../foundation/list-cell.tsx";
import { NavBar } from "../../foundation/nav-bar.tsx";
import { Page } from "../../foundation/page.tsx";
import { SegmentedControl } from "../../foundation/segmented-control.tsx";

type DatabaseRoute = { object: string | null };
export function DatabaseApp({
  database,
  onHome,
  active,
}: {
  database: PhoneDatabaseService;
  onHome: () => void;
  active: boolean;
}) {
  const state = useSyncExternalStore(database.subscribe, database.getState);
  useEffect(() => {
    if (state.context.available) void database.load().catch(() => {});
  }, [database, state.context.chatIdentity, state.context.scopeId, state.context.available]);
  const routes: DatabaseRoute[] = [{ object: null }];
  if (state.editor.selected) routes.push({ object: state.editor.selected });
  return (
    <NavigationStack
      key={JSON.stringify([state.context.chatIdentity, state.context.scopeId])}
      initialRoutes={routes}
      active={active}
    >
      {(route, navigation) => (
        <DatabasePage database={database} onHome={onHome} route={route} navigation={navigation} />
      )}
    </NavigationStack>
  );
}
function DatabasePage({
  database,
  onHome,
  route,
  navigation,
}: {
  database: PhoneDatabaseService;
  onHome: () => void;
  route: DatabaseRoute;
  navigation: Navigation<DatabaseRoute>;
}) {
  const state = useSyncExternalStore(database.subscribe, database.getState);
  const { editor } = state;
  const tab = route.object ? "objects" : editor.tab;
  const container = useRef<HTMLDivElement>(null);
  const [copy, setCopy] = useState<string | null>(null);
  const selected = state.schema?.objects.find((object) => object.name === route.object);
  const hasSchema = state.schema !== null;
  const scrollKey = `${tab}:${tab === "objects" ? (route.object ?? "list") : "editor"}`;
  useLayoutEffect(() => {
    if (!hasSchema || !navigation.current) return;
    const content = container.current!.querySelector<HTMLDivElement>(".ios-page-content")!;
    content.scrollTop = editor.scroll[scrollKey] ?? 0;
    const chat = JSON.stringify([state.context.chatIdentity, state.context.scopeId]);
    const track = () => {
      const current = database.getState();
      if (JSON.stringify([current.context.chatIdentity, current.context.scopeId]) === chat)
        database.edit({ scroll: { ...current.editor.scroll, [scrollKey]: content.scrollTop } });
    };
    content.addEventListener("scroll", track, { passive: true });
    return () => content.removeEventListener("scroll", track);
    // editor.scroll 更新不触发页面跳转或重复恢复。
  }, [
    database,
    hasSchema,
    scrollKey,
    state.context.chatIdentity,
    state.context.scopeId,
    navigation.current,
  ]);
  const status = {
    idle: "待读取",
    loading: "刷新中",
    ready: "已就绪",
    error: "刷新失败",
    unavailable: "未连接",
  }[state.status];
  return (
    <div ref={container} className="database-app">
      <Page
        className="database-page"
        navBar={
          <NavBar
            title="Fake DBeaver"
            back={{
              label: route.object !== null ? "数据库" : "主屏幕",
              onClick: () =>
                route.object !== null
                  ? (() => {
                      database.edit({ selected: null });
                      navigation.pop();
                    })()
                  : onHome(),
            }}
            right={
              <Button
                disabled={state.status === "loading" || !state.context.available}
                onClick={() => void database.load(true).catch(() => {})}
              >
                刷新
              </Button>
            }
          />
        }
      >
        <div className="database-heading">
          <div className="database-eyebrow">PHONE DATABASE · MEMORY</div>
          <h1>{state.schema?.name ?? state.context.spaceName ?? "当前数据库"}</h1>
          <p>
            {state.context.chatName ?? "尚未选择对话"} <span aria-live="polite">· {status}</span>
          </p>
        </div>
        <div className="database-tabs">
          <SegmentedControl
            label="数据库工作区"
            value={tab}
            onValueChange={(tab) => {
              database.edit({ tab: tab as "objects" | "sql", selected: null });
              if (route.object) navigation.pop();
            }}
            options={[
              { value: "objects", label: "数据库" },
              { value: "sql", label: "SQL 查询" },
            ]}
          />
        </div>
        <div className="database-notices" aria-live="polite">
          {state.context.message ? <p>{state.context.message}</p> : null}
          {state.error ? (
            <p role="alert" className="database-error">
              {state.error}
            </p>
          ) : null}
          {state.stale ? <p>来源已有更新；现有结果已过期，重新执行可读取当前已提交资料。</p> : null}
          {state.loadedAt ? (
            <p>
              最近检查视图 {new Date(state.loadedAt).toLocaleTimeString()} · 标准 schema v1 · Memory
              直连
            </p>
          ) : null}
        </div>
        {tab === "objects" ? (
          route.object ? (
            selected ? (
              <>
                <GroupedList title={selected.name} description={selected.description}>
                  <ListCell title="类型" value={selected.kind === "view" ? "标准视图" : "数据表"} />
                  <ListCell title="列数" value={String(selected.columns.length)} />
                  <ListCell
                    title="查看数据"
                    subtitle="在 SQL 编辑器打开并执行便捷查询"
                    onClick={() => {
                      database.edit({
                        tab: "sql",
                        selected: null,
                        sql: `SELECT * FROM ${quoteIdentifier(selected.name)} LIMIT 50;`,
                      });
                      navigation.pop();
                      void database.execute();
                    }}
                  />
                </GroupedList>
                <GroupedList title="列与关联">
                  {selected.columns.map((column) => (
                    <ListCell
                      key={column.name}
                      title={column.name}
                      value={column.type}
                      subtitle={`${column.description}${column.sourceFieldId ? ` · 字段 ID=${column.sourceFieldId}` : ""}${column.reference ? ` · → ${column.reference.table}.${column.reference.column}${column.reference.multiple ? "（多值）" : ""}` : ""}`}
                    />
                  ))}
                </GroupedList>
                {selected.select ? (
                  <GroupedList title="视图 SQL">
                    <pre className="database-definition">{selected.select}</pre>
                  </GroupedList>
                ) : null}
              </>
            ) : (
              <p className="database-empty">
                该对象已从当前数据库移除或暂不可用，可返回数据库列表继续浏览。
              </p>
            )
          ) : (
            <>
              <div className="database-search">
                <input
                  type="search"
                  aria-label="搜索数据库对象"
                  placeholder="搜索表、视图或说明"
                  value={editor.search}
                  onChange={(event) => database.edit({ search: event.target.value })}
                />
              </div>
              <GroupedList
                title={`对象 · ${state.schema?.objects.length ?? 0}`}
                description="src_ 映射公开业务表，phone_ 提供标准视图与映射能力。"
              >
                {state.schema?.objects
                  .filter((object) =>
                    `${object.name} ${object.description}`
                      .toLocaleLowerCase()
                      .includes(editor.search.toLocaleLowerCase()),
                  )
                  .map((object) => (
                    <ListCell
                      key={object.name}
                      title={object.name}
                      value={object.kind === "view" ? "VIEW" : "TABLE"}
                      subtitle={object.description}
                      onClick={() => {
                        database.edit({ selected: object.name });
                        navigation.push({ object: object.name });
                      }}
                    />
                  ))}
                {!state.schema ? (
                  <p className="database-empty">
                    {state.status === "loading"
                      ? "正在连接 Memory 并注册查询视图…"
                      : "读取来源后查看数据库结构。"}
                  </p>
                ) : null}
              </GroupedList>
              {state.schema ? (
                <GroupedList title="持久身份">
                  <ListCell title="来源" subtitle={state.schema.sourceId} />
                  <ListCell title="范围" subtitle={state.schema.scopeId} />
                </GroupedList>
              ) : null}
            </>
          )
        ) : (
          <>
            <div className="database-query">
              <label htmlFor="phone-sql-editor">SQL 编辑器</label>
              <textarea
                id="phone-sql-editor"
                aria-label="SQL 编辑器"
                spellCheck={false}
                value={editor.sql}
                onChange={(event) => database.edit({ sql: event.target.value })}
              />
              <div className="database-query-actions">
                <span>单条只读 · 最多 200 行 · 750 ms</span>
                <Button
                  variant="filled"
                  disabled={
                    !state.schema ||
                    editor.running ||
                    !state.context.available ||
                    state.status === "loading"
                  }
                  onClick={() => void database.execute()}
                >
                  {editor.running ? "执行中…" : "执行 SQL"}
                </Button>
              </div>
            </div>
            {editor.queryError ? (
              <p role="alert" className="database-query-error">
                {editor.queryError}
              </p>
            ) : null}
            {editor.result ? (
              <div className="database-results">
                <div className="database-result-caption">
                  <p role="status">
                    {editor.result.rows.length} 行 · {editor.result.elapsedMs.toFixed(1)} ms
                    {editor.result.truncated
                      ? ` · 已截断（上限 ${editor.result.maxRows} 行）`
                      : " · 完整结果"}
                  </p>
                  <Button
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(
                          JSON.stringify(
                            { columns: editor.result!.columns, rows: editor.result!.rows },
                            null,
                            2,
                          ),
                        )
                        .then(
                          () => setCopy("已复制 JSON"),
                          (error: unknown) => setCopy(`复制失败：${String(error)}`),
                        );
                    }}
                  >
                    复制
                  </Button>
                </div>
                <p className="database-result-hint">
                  {editor.resultStale ? "来源已更新，此结果已过期。" : "结果保留自上次执行。"}
                  重新执行读取当前资料，横向滑动查看全部列。
                </p>
                <div
                  className="database-result-scroll"
                  tabIndex={0}
                  aria-label="SQL 查询结果，可横向滚动"
                >
                  <table>
                    <thead>
                      <tr>
                        {editor.result.columns.map((column, index) => (
                          <th key={index}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {editor.result.rows.map((row, index) => (
                        <tr key={index}>
                          {row.map((value, column) => (
                            <td key={column}>
                              {value === null ? (
                                <span className="database-null">NULL</span>
                              ) : (
                                String(value)
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {copy ? <p role="status">{copy}</p> : null}
              </div>
            ) : (
              <p className="database-empty">选择对象可生成查询，也可以直接编辑 SQL。</p>
            )}
          </>
        )}
      </Page>
    </div>
  );
}
