import type { BrowserSnapshot } from "../browser-service.ts";

export type BrowserWorkStatus = "generating" | "saving" | "draft" | "saved";

/** 创作与保存都优先于草稿状态，避免同时存在的任务被静态标签盖住。 */
export function browserWorkStatus(
  snapshot: Pick<BrowserSnapshot, "generation" | "saving" | "drafts">,
  workId: string,
): BrowserWorkStatus {
  if (snapshot.generation?.workId === workId) {
    return "generating";
  }
  if (snapshot.saving === workId) {
    return "saving";
  }
  return snapshot.drafts.has(workId) ? "draft" : "saved";
}

const labels: Record<BrowserWorkStatus, string> = {
  generating: "创作中",
  saving: "保存中",
  draft: "草稿",
  saved: "已保存",
};

export function BrowserStatusPill({
  status,
  live = false,
}: {
  status: BrowserWorkStatus;
  live?: boolean;
}) {
  return (
    <span className={`browser-status browser-status--${status}`} role={live ? "status" : undefined}>
      <span className="browser-status-dot" aria-hidden="true" />
      {labels[status]}
    </span>
  );
}
