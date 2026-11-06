import { useEffect, useState } from "react";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Page } from "../../../frontend/foundation/page.tsx";
import type { PhoneLog, PhoneLogRow } from "../public.ts";
import { formatFullTime, levelName, logAppName } from "./log-labels.ts";

export function LogDetail({
  entry,
  current,
  logs,
  active,
  onBack,
}: {
  entry: PhoneLogRow;
  current: PhoneLogRow | undefined;
  logs: PhoneLog;
  active: boolean;
  onBack: () => void;
}) {
  const [copyState, setCopyState] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ content: string } | { error: string } | null>(null);
  const status = current?.status;
  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setCopyState(null);
    if (active && status !== "unavailable") {
      void logs.getDetails(entry.id).then(
        (content) => {
          if (!cancelled) {
            setDetail(content === undefined ? { error: "日志详情已清理或不可用。" } : { content });
          }
        },
        (error: unknown) => {
          if (!cancelled) {
            setDetail({ error: `读取详情失败：${String(error)}` });
          }
        },
      );
    }
    return () => {
      cancelled = true;
    };
  }, [active, entry.id, logs, status]);
  const content =
    active && status !== "unavailable" && detail && "content" in detail
      ? detail.content
      : undefined;
  async function copy() {
    try {
      if (content === undefined) {
        return;
      }
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
          right={
            <Button disabled={content === undefined} onClick={() => void copy()}>
              复制
            </Button>
          }
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
        {content !== undefined ? (
          <pre>{content}</pre>
        ) : (
          <p role="status">
            {status === "unavailable"
              ? "本条日志详情无法保留。"
              : detail && "error" in detail
                ? detail.error
                : "正在读取详情…"}
          </p>
        )}
      </section>
      {copyState ? (
        <p className="logs-copy-status" role="status">
          {copyState}
        </p>
      ) : null}
    </Page>
  );
}
