import { useState, useSyncExternalStore } from "react";
import { appCatalog } from "../../../core/launcher/catalog.ts";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { SegmentedControl } from "../../../frontend/foundation/segmented-control.tsx";
import type { PhoneLog, PhoneLogApp, PhoneLogEntry, PhoneLogLevel } from "../public.ts";

type LogsRoute = { page: "root" } | { page: "apps" } | { page: "detail"; entry: PhoneLogEntry };
type LevelFilter = PhoneLogLevel | "all";

const levelOptions = [
  { value: "all", label: "全部" },
  { value: "info", label: "信息" },
  { value: "warn", label: "警告" },
  { value: "error", label: "错误" },
] as const;

export function LogsApp({
  active,
  logs,
  onHome,
}: {
  active: boolean;
  logs: PhoneLog;
  onHome: () => void;
}) {
  const entries = useSyncExternalStore(logs.subscribe, logs.getSnapshot);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [app, setApp] = useState<PhoneLogApp | null>(null);
  return (
    <NavigationStack<LogsRoute> initialRoutes={[{ page: "root" }]} active={active}>
      {(route, navigation) =>
        route.page === "root" ? (
          <LogsRoot
            active={active}
            entries={entries}
            level={level}
            app={app}
            onHome={onHome}
            onLevelChange={setLevel}
            onPickApp={() => navigation.push({ page: "apps" })}
            onOpen={(entry) => navigation.push({ page: "detail", entry })}
            onClear={logs.clear}
          />
        ) : route.page === "apps" ? (
          <LogAppFilter
            entries={entries}
            selected={app}
            onBack={navigation.pop}
            onSelect={(next) => {
              setApp(next);
              navigation.pop();
            }}
          />
        ) : (
          <LogDetail entry={route.entry} onBack={navigation.pop} />
        )
      }
    </NavigationStack>
  );
}

function LogsRoot({
  active,
  entries,
  level,
  app,
  onHome,
  onLevelChange,
  onPickApp,
  onOpen,
  onClear,
}: {
  active: boolean;
  entries: readonly PhoneLogEntry[];
  level: LevelFilter;
  app: PhoneLogApp | null;
  onHome: () => void;
  onLevelChange: (level: LevelFilter) => void;
  onPickApp: () => void;
  onOpen: (entry: PhoneLogEntry) => void;
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  // 列表按发生时间倒序；筛选只影响展示，不影响本地保存的内容。
  const visible = entries
    .filter(
      (entry) => (level === "all" || entry.level === level) && (app === null || entry.app === app),
    )
    .reverse();
  return (
    <>
      <Page
        className="logs-page"
        inert={confirming}
        navBar={
          <NavBar
            title="日志"
            back={{ label: "主屏幕", onClick: onHome }}
            right={
              <Button disabled={entries.length === 0} onClick={() => setConfirming(true)}>
                清除
              </Button>
            }
          />
        }
      >
        <div className="logs-filters">
          <SegmentedControl
            label="级别"
            value={level}
            onValueChange={(value) => onLevelChange(value as LevelFilter)}
            options={levelOptions}
          />
          <Button className="logs-app-filter" onClick={onPickApp}>
            应用：{app === null ? "全部" : logAppName(app)}
          </Button>
        </div>
        {visible.length === 0 ? (
          <p className="logs-empty" role="status">
            {entries.length === 0
              ? "还没有日志。最近 1000 条会保存在当前浏览器。"
              : "当前筛选没有日志。"}
          </p>
        ) : (
          <ul className="logs-list" aria-label="日志列表">
            {visible.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`logs-row ${entry.level === "error" ? "logs-row--error" : ""}`}
                  onClick={() => onOpen(entry)}
                >
                  <span
                    className={`logs-level-dot logs-level-dot--${entry.level}`}
                    aria-hidden="true"
                  />
                  <span className="logs-copy">
                    <span className="logs-summary">{entry.message}</span>
                    <span className="logs-meta">
                      <span>{formatTime(entry.time)}</span>
                      <span>{levelName(entry.level)}</span>
                      <span>{logAppName(entry.app)}</span>
                      <span>{entry.scope}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Page>
      {confirming ? (
        <Alert
          title="清除日志？"
          active={active}
          onDismiss={() => setConfirming(false)}
          actions={[
            { label: "取消", onClick: () => setConfirming(false) },
            {
              label: "清除",
              primary: true,
              onClick: () => {
                onClear();
                setConfirming(false);
              },
            },
          ]}
        >
          清除后无法恢复。
        </Alert>
      ) : null}
    </>
  );
}

function LogAppFilter({
  entries,
  selected,
  onBack,
  onSelect,
}: {
  entries: readonly PhoneLogEntry[];
  selected: PhoneLogApp | null;
  onBack: () => void;
  onSelect: (app: PhoneLogApp | null) => void;
}) {
  const apps = [...new Set(entries.map((entry) => entry.app))].sort((left, right) =>
    logAppName(left).localeCompare(logAppName(right), "zh-CN"),
  );
  return (
    <Page navBar={<NavBar title="筛选应用" back={{ label: "日志", onClick: onBack }} />}>
      <GroupedList description="只列出当前日志中出现过的应用。">
        <ListCell
          title="全部应用"
          value={selected === null ? "已选" : undefined}
          onClick={() => onSelect(null)}
        />
        {apps.map((app) => (
          <ListCell
            key={app}
            title={logAppName(app)}
            value={selected === app ? "已选" : undefined}
            onClick={() => onSelect(app)}
          />
        ))}
      </GroupedList>
    </Page>
  );
}

function LogDetail({ entry, onBack }: { entry: PhoneLogEntry; onBack: () => void }) {
  const [copyState, setCopyState] = useState<string | null>(null);
  const content = entry.details ?? entry.message;
  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopyState("已复制");
    } catch {
      setCopyState("复制失败");
    }
  }
  return (
    <Page
      navBar={
        <NavBar
          title="日志详情"
          back={{ label: "日志", onClick: onBack }}
          right={<Button onClick={() => void copy()}>复制</Button>}
        />
      }
    >
      <GroupedList>
        <ListCell title="时间" value={formatFullTime(entry.time)} />
        <ListCell title="级别" value={levelName(entry.level)} />
        <ListCell title="应用" value={logAppName(entry.app)} />
        <ListCell title="来源" value={entry.scope} />
      </GroupedList>
      <section className="logs-detail" aria-label="日志内容">
        <h2>内容</h2>
        <pre>{content}</pre>
      </section>
      {copyState ? (
        <p className="logs-copy-status" role="status">
          {copyState}
        </p>
      ) : null}
    </Page>
  );
}

function logAppName(app: PhoneLogApp): string {
  return app === "system" ? "系统" : appCatalog[app].name;
}

function levelName(level: PhoneLogLevel): string {
  return level === "info" ? "信息" : level === "warn" ? "警告" : "错误";
}

function formatTime(time: number): string {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(
    date.getMilliseconds(),
  ).padStart(3, "0")}`;
}

function formatFullTime(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${formatTime(
    time,
  )}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
