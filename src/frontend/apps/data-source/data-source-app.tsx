import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { DataSourceState, PhoneDataSource } from "../../../features/background/index.ts";
import { Button } from "../../foundation/button.tsx";
import { GroupedList } from "../../foundation/grouped-list.tsx";
import { ListCell } from "../../foundation/list-cell.tsx";
import { NavBar } from "../../foundation/nav-bar.tsx";
import { Page } from "../../foundation/page.tsx";

type Category = "characters" | "chronicles" | "items";
const categoryNames = { characters: "人物", chronicles: "纪要", items: "物品" } as const;
const statusNames = {
  unavailable: "未连接",
  idle: "待更新",
  loading: "读取中",
  ready: "已连接",
  error: "读取失败",
} as const;

export function DataSourceApp({ source, onHome }: { source: PhoneDataSource; onHome: () => void }) {
  const state = useSyncExternalStore(source.subscribe, source.getState);
  useEffect(() => {
    if (source.getState().context.available) void source.load().catch(() => {});
  }, [source]);
  return (
    <DataBrowser
      key={JSON.stringify([state.context.chatIdentity, state.context.scopeId])}
      source={source}
      state={state}
      onHome={onHome}
    />
  );
}

function DataBrowser({
  source,
  state,
  onHome,
}: {
  source: PhoneDataSource;
  state: DataSourceState;
  onHome: () => void;
}) {
  const [category, setCategory] = useState<Category | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copyResult, setCopyResult] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const entries =
    category === "characters"
      ? state.data?.characters.map((entry) => ({
          id: entry.id,
          title: entry.name,
          text: entry.profileText,
        }))
      : category === "chronicles"
        ? state.data?.chronicles.map((entry) => ({
            id: entry.id,
            title: entry.title,
            text: entry.content,
          }))
        : category === "items"
          ? state.data?.items.map((entry) => ({
              id: entry.id,
              title: entry.name,
              text: entry.description,
            }))
          : undefined;
  const selected = entries?.find((entry) => entry.id === selectedId);
  const query = search.trim().toLocaleLowerCase();
  const visible = entries?.filter((entry) =>
    `${entry.title}\n${entry.text}`.toLocaleLowerCase().includes(query),
  );

  useEffect(() => {
    container
      .current!.querySelector<HTMLButtonElement>(".ios-nav button")!
      .focus({ preventScroll: true });
  }, [category, selectedId]);

  async function copyText() {
    setCopyResult(null);
    try {
      await navigator.clipboard.writeText(selected!.text);
      setCopyResult("已复制正文");
    } catch (error) {
      setCopyResult(`复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const title = selectedId ? "资料详情" : category ? categoryNames[category] : "资料";
  return (
    <div ref={container} className="data-app">
      <Page
        key={`${category}:${selectedId}`}
        className="data-page"
        navBar={
          <NavBar
            title={title}
            back={{
              label:
                selectedId && category ? categoryNames[category] : category ? "资料" : "主屏幕",
              onClick: () => {
                if (selectedId) {
                  setSelectedId(null);
                  setCopyResult(null);
                } else if (category) {
                  setCategory(null);
                  setSearch("");
                } else onHome();
              },
            }}
            right={
              selectedId ? (
                <Button disabled={!selected} onClick={() => void copyText()}>
                  复制
                </Button>
              ) : (
                <Button
                  disabled={!state.context.available || state.status === "loading"}
                  onClick={() => void source.load({ force: true }).catch(() => {})}
                >
                  刷新
                </Button>
              )
            }
          />
        }
      >
        <div className="data-notices" aria-live="polite" aria-atomic="true">
          {state.status === "loading" ? <p>正在读取最新资料…</p> : null}
          {state.context.message ? <p>{state.context.message}</p> : null}
          {state.error ? (
            <p role="alert" className="data-error">
              {state.error}
            </p>
          ) : null}
          {state.stale ? <p>当前显示上次成功读取的资料，等待更新。</p> : null}
        </div>
        {category === null ? (
          <>
            <GroupedList title="数据来源" description="只读连接，资料更新后自动重新读取。">
              <ListCell title="来源" value={state.context.sourceName} />
              <ListCell title="状态" value={statusNames[state.status]} />
              <ListCell
                title="当前对话"
                subtitle={state.context.chatName ?? "尚未选择已保存的对话"}
              />
              <ListCell title="记忆空间" subtitle={state.context.spaceName ?? "尚未就绪"} />
              {state.loadedAt ? (
                <ListCell title="最近读取" subtitle={new Date(state.loadedAt).toLocaleString()} />
              ) : null}
            </GroupedList>
            {state.data ? (
              <GroupedList
                title="背景资料"
                description="人物、纪要与物品由 Memory 转换提供。纪要按记录创建顺序排列。"
              >
                {(["characters", "chronicles", "items"] as const).map((key) => (
                  <ListCell
                    key={key}
                    title={categoryNames[key]}
                    value={String(state.data![key].length)}
                    onClick={() => setCategory(key)}
                  />
                ))}
              </GroupedList>
            ) : null}
          </>
        ) : selectedId ? (
          <>
            {selected ? (
              <GroupedList title={selected.title}>
                <p className="data-detail">{selected.text}</p>
              </GroupedList>
            ) : (
              <p className="data-empty">该条资料已从当前数据源中移除。</p>
            )}
            {copyResult ? (
              <p className="data-message" role="status">
                {copyResult}
              </p>
            ) : null}
            {selected && state.data ? (
              <details className="data-origin">
                <summary>来源信息</summary>
                <p>来源：{state.data.sourceId}</p>
                <p>范围：{state.data.scopeId}</p>
                <p>条目：{selected.id}</p>
              </details>
            ) : null}
          </>
        ) : (
          <>
            <label className="data-search">
              <span className="data-search-label">搜索{categoryNames[category]}</span>
              <input
                type="search"
                placeholder="搜索名称或正文"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <GroupedList
              title={`${categoryNames[category]} · ${visible?.length ?? 0}`}
              description={
                category === "chronicles" ? "按记录创建时间排列，不代表剧情发生顺序。" : undefined
              }
            >
              {visible?.length ? (
                visible.map((entry) => (
                  <ListCell
                    key={entry.id}
                    title={entry.title}
                    subtitle={entry.text}
                    onClick={() => setSelectedId(entry.id)}
                  />
                ))
              ) : (
                <p className="data-empty">{query ? "没有匹配的资料" : "这个分类还没有资料"}</p>
              )}
            </GroupedList>
          </>
        )}
      </Page>
    </div>
  );
}
