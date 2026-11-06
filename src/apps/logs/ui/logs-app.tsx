import { useState, useSyncExternalStore } from "react";
import { LogDetail } from "./log-detail.tsx";
import { formatTime, levelName, logAppName } from "./log-labels.ts";
import { Alert } from "../../../frontend/foundation/alert.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { NavigationStack } from "../../../frontend/foundation/navigation-stack.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import { SegmentedControl } from "../../../frontend/foundation/segmented-control.tsx";
import type {
  PhoneLog,
  PhoneLogApp,
  PhoneLogRow,
  PhoneLogLevel,
  PhoneLogSnapshot,
} from "../public.ts";

type LogsRoute = { page: "root" } | { page: "apps" } | { page: "detail"; entry: PhoneLogRow };
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
  const snapshot = useSyncExternalStore(logs.subscribe, logs.getSnapshot);
  const [level, setLevel] = useState<LevelFilter>("all");
  const [app, setApp] = useState<PhoneLogApp | null>(null);
  return (
    <NavigationStack<LogsRoute> initialRoutes={[{ page: "root" }]} active={active}>
      {(route, navigation) =>
        route.page === "root" ? (
          <LogsRoot
            active={active}
            level={level}
            app={app}
            onHome={onHome}
            onLevelChange={setLevel}
            onPickApp={() => navigation.push({ page: "apps" })}
            onOpen={(entry) => navigation.push({ page: "detail", entry })}
            onClear={logs.clear}
            onRetry={logs.retry}
            snapshot={snapshot}
          />
        ) : route.page === "apps" ? (
          <LogAppFilter
            entries={snapshot.entries}
            selected={app}
            onBack={navigation.pop}
            onSelect={(next) => {
              setApp(next);
              navigation.pop();
            }}
          />
        ) : (
          <LogDetail
            entry={route.entry}
            current={snapshot.entries.find((row) => row.id === route.entry.id)}
            logs={logs}
            active={active}
            onBack={navigation.pop}
          />
        )
      }
    </NavigationStack>
  );
}

function LogsRoot({
  active,
  snapshot,
  level,
  app,
  onHome,
  onLevelChange,
  onPickApp,
  onOpen,
  onClear,
  onRetry,
}: {
  active: boolean;
  snapshot: PhoneLogSnapshot;
  level: LevelFilter;
  app: PhoneLogApp | null;
  onHome: () => void;
  onLevelChange: (level: LevelFilter) => void;
  onPickApp: () => void;
  onOpen: (entry: PhoneLogRow) => void;
  onClear: () => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  const { entries, storageError, canRetry, loading, clearing } = snapshot;
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
              <Button
                disabled={loading || clearing || (entries.length === 0 && !storageError)}
                onClick={() => setConfirming(true)}
              >
                {clearing ? "清除中…" : "清除"}
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
        {storageError ? (
          <div className="logs-storage-error" role="status">
            <p>{storageError}</p>
            {canRetry ? (
              <Button disabled={loading || clearing} onClick={() => void onRetry()}>
                重试保存
              </Button>
            ) : null}
          </div>
        ) : null}
        {visible.length === 0 ? (
          <p className="logs-empty" role="status">
            {loading
              ? "正在读取日志…"
              : entries.length === 0
                ? "还没有日志。最多保留最近 1000 条，受存储容量限制。"
                : "当前筛选没有日志。"}
          </p>
        ) : (
          <LogsList entries={visible} onOpen={onOpen} />
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
                void onClear();
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

function LogsList({
  entries,
  onOpen,
}: {
  entries: readonly PhoneLogRow[];
  onOpen: (entry: PhoneLogRow) => void;
}) {
  return (
    <ul className="logs-list" aria-label="日志列表">
      {entries.map((entry) => (
        <li key={entry.id}>
          <button
            type="button"
            className={`logs-row ${entry.level === "error" ? "logs-row--error" : ""}`}
            onClick={() => onOpen(entry)}
          >
            <span className={`logs-level-dot logs-level-dot--${entry.level}`} aria-hidden="true" />
            <span className="logs-copy">
              <span className="logs-summary">{entry.message}</span>
              {entry.status === "unsaved" || entry.status === "unavailable" ? (
                <span className="logs-meta">
                  {entry.status === "unsaved" ? "未保存" : "详情不可用"}
                </span>
              ) : null}
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
  );
}

function LogAppFilter({
  entries,
  selected,
  onBack,
  onSelect,
}: {
  entries: readonly PhoneLogRow[];
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
