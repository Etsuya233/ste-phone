import { useEffect, useState, useSyncExternalStore } from "react";
import type { DiaryService } from "../diary-service.ts";
import type { DiaryEntry } from "../diary.ts";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import type { Navigation } from "../../../frontend/foundation/navigation-stack.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { TextField } from "../../../frontend/foundation/text-field.tsx";

type Route =
  | { page: "list" | "authors" | "settings" }
  | { page: "write"; previousResultId: string | null }
  | { page: "detail"; id: string };
type DiarySnapshot = ReturnType<DiaryService["getSnapshot"]>;

export function DiaryApp({
  diary,
  active,
  onHome,
}: {
  diary: DiaryService;
  active: boolean;
  onHome: () => void;
}) {
  const state = useSyncExternalStore(diary.subscribe, diary.getSnapshot);
  useEffect(() => {
    void diary.prepare();
  }, [diary, state.chatId]);
  return (
    <NavigationStack<Route> key={state.chatId} active={active} initialRoutes={[{ page: "list" }]}>
      {(route, navigation) => (
        <DiaryPage
          diary={diary}
          state={state}
          route={route}
          navigation={navigation}
          onHome={onHome}
        />
      )}
    </NavigationStack>
  );
}

function DiaryPage({
  diary,
  state,
  route,
  navigation,
  onHome,
}: {
  diary: DiaryService;
  state: DiarySnapshot;
  route: Route;
  navigation: Navigation<Route>;
  onHome: () => void;
}) {
  const [deleting, setDeleting] = useState<DiaryEntry | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const busy =
    state.status === "loading" || state.status === "generating" || state.status === "saving";
  useEffect(() => {
    if (navigation.current && (route.page === "authors" || route.page === "write")) {
      void diary.prepare();
    }
  }, [diary, route.page, navigation.current]);
  const openWriter = () =>
    navigation.push({ page: "write", previousResultId: state.result?.id ?? null });
  const savedEntry =
    route.page === "detail" ? state.data.entries.find((entry) => entry.id === route.id) : null;
  const generatedEntry =
    route.page === "write" && !state.unsaved && state.result?.id !== route.previousResultId
      ? state.result
      : null;
  const entry = savedEntry ?? generatedEntry;
  const title =
    route.page === "list"
      ? "日记"
      : route.page === "authors"
        ? "日记作者"
        : route.page === "settings"
          ? "生成设置"
          : entry
            ? "日记详情"
            : "写日记";

  async function deleteSelected() {
    const selected = deleting!;
    setDeleting(null);
    setOperationError(null);
    try {
      await diary.deleteEntry(selected.id);
      navigation.pop();
    } catch (error) {
      setOperationError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <div className="diary-app">
      <Page
        inert={deleting !== null}
        className="diary-page"
        navBar={
          <NavBar
            title={title}
            back={{
              label: route.page === "list" ? "主屏幕" : "日记",
              onClick: route.page === "list" ? onHome : navigation.pop,
            }}
            right={
              route.page === "list" ? (
                <Button disabled={!state.chatId} onClick={openWriter}>
                  写日记
                </Button>
              ) : route.page === "authors" ? (
                <Button disabled={busy} onClick={() => void diary.prepare()}>
                  刷新
                </Button>
              ) : null
            }
          />
        }
      >
        <div className="diary-notices" aria-live="polite">
          {state.error ? (
            <p className="diary-error" role="alert">
              {state.error}
            </p>
          ) : null}
          {operationError ? (
            <p className="diary-error" role="alert">
              {operationError}
            </p>
          ) : null}
          {!state.chatId ? <p>选择一个聊天后，即可记录这里的日记。</p> : null}
        </div>

        {route.page === "list" ? (
          <>
            <GroupedList>
              <ListCell
                title="作者"
                value={state.data.author?.name ?? "选择人物"}
                disabled={!state.chatId || busy}
                onClick={() => navigation.push({ page: "authors" })}
              />
              <ListCell
                title="生成设置"
                disabled={!state.chatId || busy}
                onClick={() => navigation.push({ page: "settings" })}
              />
              {busy ? (
                <ListCell
                  title={state.status === "saving" ? "正在保存…" : "正在写日记…"}
                  onClick={openWriter}
                />
              ) : null}
            </GroupedList>
            <GroupedList title="日记本">
              {state.data.entries.length ? (
                state.data.entries.map((item) => (
                  <ListCell
                    key={item.id}
                    title={`${item.worldTime.split(/[T ]/)[0]} · ${item.author.name}`}
                    subtitle={item.body}
                    onClick={() => navigation.push({ page: "detail", id: item.id })}
                  />
                ))
              ) : (
                <div className="diary-empty">
                  <p>还没有日记</p>
                  <p>留下一篇此刻的心情与经历。</p>
                  <Button disabled={!state.chatId} onClick={openWriter}>
                    写第一篇
                  </Button>
                </div>
              )}
            </GroupedList>
          </>
        ) : route.page === "authors" ? (
          <GroupedList title="选择一位人物" description="之后的日记将以这位人物的第一人称书写。">
            {state.status === "loading" ? <p className="diary-message">正在读取人物…</p> : null}
            {state.authors.map((author) => (
              <ListCell
                key={author.id}
                title={author.name}
                subtitle={author.profileText}
                value={state.data.author?.id === author.id ? "✓" : undefined}
                disabled={busy}
                onClick={() => {
                  setOperationError(null);
                  void diary.selectAuthor(author.id).then(navigation.pop, (error: unknown) => {
                    setOperationError(error instanceof Error ? error.message : String(error));
                  });
                }}
              />
            ))}
            {!state.authors.length && state.status !== "loading" ? (
              <p className="diary-message">当前资料中没有可选人物。</p>
            ) : null}
          </GroupedList>
        ) : route.page === "settings" ? (
          <GenerationSettings
            diary={diary}
            settings={state.data.settings}
            onBack={navigation.pop}
          />
        ) : entry ? (
          <DiaryReading
            entry={entry}
            onDelete={() => setDeleting(entry)}
            onWrite={route.page === "write" ? () => void diary.generate() : openWriter}
            busy={busy}
          />
        ) : route.page === "detail" ? (
          <p className="diary-message">这篇日记已删除。</p>
        ) : (
          <>
            <GroupedList>
              <ListCell
                title="作者"
                value={state.data.author?.name ?? "选择人物"}
                disabled={busy}
                onClick={() => navigation.push({ page: "authors" })}
              />
              <ListCell title="此刻" subtitle={state.worldTime ?? "尚未取得世界时间"} />
            </GroupedList>
            <div className="diary-write-actions">
              {busy ? (
                <Button
                  variant="danger"
                  disabled={state.status === "saving"}
                  onClick={() => diary.cancel()}
                >
                  {state.status === "saving" ? "正在保存…" : "取消生成"}
                </Button>
              ) : (
                <Button
                  variant="filled"
                  disabled={!state.chatId || !state.data.author}
                  onClick={() => void diary.generate()}
                >
                  生成日记
                </Button>
              )}
            </div>
            {state.status === "loading" ? (
              <p className="diary-message" role="status">
                正在读取资料…
              </p>
            ) : null}
            {state.notice ? <p className="diary-message">{state.notice}</p> : null}
            {state.unsaved && state.status === "error" ? (
              <>
                <p className="diary-message diary-error">正文已生成，保存失败。</p>
                <div className="diary-write-actions">
                  <Button onClick={() => void diary.retrySave()}>重新保存</Button>
                </div>
                <DiaryText body={state.unsaved.body} />
              </>
            ) : state.text ? (
              <DiaryText body={state.text} />
            ) : (
              <p className="diary-message">结合当前处境和最近的经历，写下此刻的日记。</p>
            )}
          </>
        )}
      </Page>
      {deleting ? (
        <Alert
          title="删除这篇日记？"
          active={navigation.current}
          onDismiss={() => setDeleting(null)}
          actions={[
            { label: "保留", onClick: () => setDeleting(null), primary: true },
            { label: "删除", onClick: () => void deleteSelected() },
          ]}
        >
          <p>删除后无法恢复。</p>
        </Alert>
      ) : null}
    </div>
  );
}

function DiaryReading({
  entry,
  onWrite,
  onDelete,
  busy,
}: {
  entry: DiaryEntry;
  onWrite: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  return (
    <>
      <div className="diary-heading">
        <p className="diary-author">{entry.author.name}</p>
        <p className="diary-time">{entry.worldTime}</p>
      </div>
      <DiaryText body={entry.body} />
      <div className="diary-entry-actions">
        <Button disabled={busy} onClick={onWrite}>
          再写一篇
        </Button>
        <Button variant="danger" disabled={busy} onClick={onDelete}>
          删除日记
        </Button>
      </div>
    </>
  );
}

function DiaryText({ body }: { body: string }) {
  const [message, setMessage] = useState<string | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(body);
      setMessage("已复制正文");
    } catch (error) {
      setMessage(`复制失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return (
    <>
      <article className="diary-body">{body}</article>
      <div className="diary-copy">
        <Button onClick={() => void copy()}>复制正文</Button>
        {message ? <p role="status">{message}</p> : null}
      </div>
    </>
  );
}

function GenerationSettings({
  diary,
  settings,
  onBack,
}: {
  diary: DiaryService;
  settings: DiarySnapshot["data"]["settings"];
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
        description="字数随人物和材料自然发挥，输出上限仅限制模型请求。修改后从下一次生成生效。"
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
