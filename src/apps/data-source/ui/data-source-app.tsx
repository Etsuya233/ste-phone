import { ProfileAvatar } from "../../../frontend/images/profile-avatar.tsx";
import type { CharacterProfile, DataScope } from "../public.ts";
import type { PhoneDataService } from "../data-service.ts";
import { CharacterEditor } from "./character-editor.tsx";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import type { Navigation } from "../../../frontend/foundation/navigation-stack.tsx";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { DataSourceSnapshot, DataAppPublic } from "../public.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { NavBar, NavBarActionGroup } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { StorySummaryPage } from "./story-summary-page.tsx";

type Category = "characters" | "chronicles" | "items";
const categoryNames = { characters: "人物", chronicles: "纪要", items: "物品" } as const;
const statusNames = {
  unavailable: "未连接",
  idle: "待更新",
  loading: "读取中",
  ready: "已连接",
  error: "读取失败",
} as const;

type Route = {
  category: Category | null;
  selectedId: string | null;
  summary?: boolean;
  editing?: { person: CharacterProfile; scope: DataScope; hostChatId: string };
};
export function DataSourceApp({
  source,
  onHome,
  active,
}: {
  source: PhoneDataService;
  onHome: () => void;
  active: boolean;
}) {
  const state = useSyncExternalStore(source.subscribe, source.getSnapshot);
  useEffect(() => {
    if (state.context.available) {
      void source.readBackground(source.getSnapshot().context).catch(() => {});
    }
  }, [
    source,
    state.hostChatId,
    state.context.chatIdentity,
    state.context.scopeId,
    state.context.available,
    state.revision,
  ]);
  return (
    <NavigationStack<Route>
      key={JSON.stringify([state.hostChatId, state.context.chatIdentity, state.context.scopeId])}
      active={active}
      initialRoutes={[{ category: null, selectedId: null }]}
    >
      {(route, navigation) =>
        route.editing ? (
          <CharacterEditor
            person={route.editing.person}
            active={navigation.current}
            onBack={navigation.pop}
            onSave={(changes) => {
              const { scope, hostChatId, person } = route.editing!;
              return source.saveCharacter(scope, hostChatId, person.id, changes);
            }}
          />
        ) : route.summary ? (
          <StorySummaryPage source={source} onBack={navigation.pop} />
        ) : (
          <DataBrowser
            source={source}
            state={state}
            onHome={onHome}
            route={route}
            navigation={navigation}
          />
        )
      }
    </NavigationStack>
  );
}

function DataBrowser({
  source,
  state,
  onHome,
  route,
  navigation,
}: {
  source: DataAppPublic;
  state: DataSourceSnapshot;
  onHome: () => void;
  route: Route;
  navigation: Navigation<Route>;
}) {
  const { category, selectedId } = route;
  const [search, setSearch] = useState("");
  const [copyResult, setCopyResult] = useState<string | null>(null);
  const entries:
    { id: string; title: string; text: string; person?: CharacterProfile }[] | undefined =
    category === "characters"
      ? state.data?.characters.map((entry) => ({
          id: entry.id,
          title: entry.name,
          text: entry.profileText,
          person: entry,
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
  const selectedPerson = selected?.person;
  const query = search.trim().toLocaleLowerCase();
  const visible = entries?.filter((entry) =>
    `${entry.title}\n${entry.text}`.toLocaleLowerCase().includes(query),
  );

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
    <div className="data-app">
      <Page
        className="data-page"
        navBar={
          <NavBar
            title={title}
            back={{
              label:
                selectedId && category ? categoryNames[category] : category ? "资料" : "主屏幕",
              onClick: () => {
                if (category) {
                  navigation.pop();
                } else {
                  onHome();
                }
              },
            }}
            right={
              selectedId ? (
                <NavBarActionGroup label="资料操作">
                  {selectedPerson && state.hostChatId ? (
                    <Button
                      onClick={() =>
                        navigation.push({
                          ...route,
                          editing: {
                            person: selectedPerson,
                            scope: state.context,
                            hostChatId: state.hostChatId!,
                          },
                        })
                      }
                    >
                      编辑
                    </Button>
                  ) : null}
                  <Button disabled={!selected} onClick={() => void copyText()}>
                    复制
                  </Button>
                </NavBarActionGroup>
              ) : (
                <Button
                  disabled={!state.context.available || state.status === "loading"}
                  onClick={() =>
                    void source
                      .readBackground({ ...source.getSnapshot().context, force: true })
                      .catch(() => {})
                  }
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
          {state.data?.backgroundError ? (
            <p role="alert" className="data-error">
              {state.data.backgroundError}。完整源表可在 Fake DBeaver 中检查。
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
            {state.context.available ? (
              <GroupedList title="剧情">
                <ListCell
                  title="剧情总结"
                  onClick={() =>
                    navigation.push({ category: null, selectedId: null, summary: true })
                  }
                />
              </GroupedList>
            ) : null}
            {state.data && !state.data.backgroundError ? (
              <GroupedList
                title="背景资料"
                description="人物、纪要与物品由 Memory 转换提供。纪要按记录创建顺序排列。"
              >
                {(["characters", "chronicles", "items"] as const).map((key) => (
                  <ListCell
                    key={key}
                    title={categoryNames[key]}
                    value={String(state.data![key].length)}
                    onClick={() => navigation.push({ category: key, selectedId: null })}
                  />
                ))}
              </GroupedList>
            ) : null}
          </>
        ) : selectedId ? (
          <>
            {selected ? (
              <GroupedList title={selected.title}>
                {selectedPerson ? (
                  <ProfileAvatar
                    className="data-character-avatar data-detail-avatar"
                    path={selectedPerson.avatar?.imagePath}
                  >
                    {selectedPerson.name.slice(0, 1)}
                  </ProfileAvatar>
                ) : null}
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
              <div className="data-origin">
                <GroupedList title="来源信息">
                  <ListCell title="来源" value={state.data.sourceId} />
                  <ListCell title="范围" value={state.data.scopeId} />
                  <ListCell title="条目" value={selected.id} />
                </GroupedList>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="data-search">
              <input
                type="search"
                aria-label={`搜索${categoryNames[category]}`}
                placeholder="搜索名称或正文"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
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
                    title={
                      entry.person ? (
                        <span className="data-character-actions">
                          <ProfileAvatar
                            className="data-character-avatar"
                            path={entry.person.avatar?.imagePath}
                          >
                            {entry.title.slice(0, 1)}
                          </ProfileAvatar>
                          {entry.title}
                        </span>
                      ) : (
                        entry.title
                      )
                    }
                    subtitle={entry.text}
                    onClick={() => navigation.push({ category, selectedId: entry.id })}
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
