import { useState } from "react";
import {
  Alert,
  Button,
  NavBar,
  NavBarActionGroup,
  Page,
} from "../../../frontend/foundation/foundation.tsx";
import type { BrowserSnapshot } from "../browser-service.ts";
import type { WebsiteWork } from "../browser.ts";
import { BrowserCompassIcon, BrowserPlusIcon, BrowserSparkleIcon } from "./browser-icons.tsx";
import { useBrowserModel, type BrowserModels } from "./browser-models.tsx";
import { browserWorkStatus, BrowserStatusPill } from "./browser-status.tsx";

export function BrowserLibrary({
  snapshot,
  models,
  current,
  onHome,
  onOpen,
  onCreate,
  onSettings,
  onDiscard,
  onStop,
}: {
  snapshot: BrowserSnapshot;
  models: BrowserModels;
  current: boolean;
  onHome: () => void;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onSettings: () => void;
  onDiscard: (id: string) => void;
  onStop: () => void;
}) {
  const [discardId, setDiscardId] = useState<string | null>(null);
  const { connections, connection, preferred } = useBrowserModel(models);
  const works = [
    ...[...snapshot.drafts.values()].filter(
      (draft) => !snapshot.saved.works.some((saved) => saved.id === draft.id),
    ),
    ...snapshot.saved.works.map((work) => snapshot.drafts.get(work.id) ?? work),
  ];
  const titleOf = (id: string) => works.find((work) => work.id === id)?.title || "未命名作品";
  const generation = snapshot.generation;
  const savingTitle = snapshot.saving ? titleOf(snapshot.saving) : null;
  const canCreate = !!snapshot.chatId && !snapshot.readError && !snapshot.saving;
  const modelText = !connections.length
    ? "尚未添加连接"
    : connection
      ? `${connection.name} · ${connection.model}`
      : preferred
        ? "原连接已删除"
        : "尚未选择";
  const discarded = discardId ? works.find((work) => work.id === discardId) : null;
  const discardedSaved = !!discardId && snapshot.saved.works.some((work) => work.id === discardId);

  return (
    <>
      <Page
        className="browser-page browser-library-page"
        inert={discardId !== null}
        largeTitle="浏览器"
        navBar={
          <NavBar
            title="浏览器"
            back={{ label: "主屏幕", onClick: onHome }}
            right={
              <NavBarActionGroup label="浏览器操作">
                <Button onClick={onSettings} aria-label="模型设置">
                  模型
                </Button>
                <Button onClick={onCreate} disabled={!canCreate}>
                  新建
                </Button>
              </NavBarActionGroup>
            }
          />
        }
      >
        <section className="browser-library">
          <header className="browser-library-head">
            <p className="browser-eyebrow">网页作品{works.length ? ` · ${works.length}` : ""}</p>
            <p className="browser-library-lead">角色写下的页面，留在当前聊天，随时打开。</p>
            <button
              type="button"
              className="browser-model-chip"
              onClick={onSettings}
              aria-label={`创作模型：${modelText}。打开模型设置`}
            >
              <span className="browser-model-chip-mark" aria-hidden="true">
                <BrowserSparkleIcon />
              </span>
              <span className="browser-model-chip-copy">
                <span className="browser-model-chip-title">创作模型</span>
                <span className="browser-model-chip-value" data-empty={!connection || undefined}>
                  {modelText}
                </span>
              </span>
              <span className="browser-chevron" aria-hidden="true">
                ›
              </span>
            </button>
          </header>

          {generation || savingTitle ? (
            <div className="browser-activity" role="status">
              <span className="browser-activity-dot" aria-hidden="true" />
              <div className="browser-activity-copy">
                {generation ? <p>正在创作「{titleOf(generation.workId)}」</p> : null}
                {savingTitle ? <p>正在保存「{savingTitle}」</p> : null}
              </div>
              {generation ? (
                <div className="browser-activity-actions">
                  <Button onClick={() => onOpen(generation.workId)}>查看</Button>
                  <Button variant="danger" onClick={onStop}>
                    停止
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {snapshot.error ? (
            <p className="browser-alert" role="alert">
              {snapshot.error}
            </p>
          ) : null}

          {snapshot.readError ? (
            <div className="browser-empty">
              <div className="browser-empty-art" aria-hidden="true">
                <span className="browser-empty-lights">
                  <i />
                  <i />
                  <i />
                </span>
                <BrowserCompassIcon className="browser-empty-globe" />
              </div>
              <h2>作品暂时读不出来</h2>
              <p>{snapshot.readError}</p>
            </div>
          ) : !snapshot.chatId ? (
            <div className="browser-empty">
              <div className="browser-empty-art" aria-hidden="true">
                <span className="browser-empty-lights">
                  <i />
                  <i />
                  <i />
                </span>
                <BrowserCompassIcon className="browser-empty-globe" />
              </div>
              <h2>先打开一个聊天</h2>
              <p>网页作品按 ST 聊天保存，打开聊天后就能开始创作。</p>
            </div>
          ) : works.length === 0 ? (
            <div className="browser-empty">
              <div className="browser-empty-art" aria-hidden="true">
                <span className="browser-empty-lights">
                  <i />
                  <i />
                  <i />
                </span>
                <BrowserCompassIcon className="browser-empty-globe" />
              </div>
              <h2>还没有网页作品</h2>
              <p>选一位角色，从一句描述开始，做出能点、能玩的网页。</p>
              <Button
                variant="filled"
                className="browser-empty-action"
                disabled={!canCreate}
                onClick={onCreate}
              >
                <BrowserPlusIcon />
                新建网页
              </Button>
              {!connection ? (
                <p className="browser-empty-hint">生成前需要选择一个模型连接。</p>
              ) : null}
            </div>
          ) : (
            <ul className="browser-works">
              {works.map((work) => (
                <WorkCard
                  key={work.id}
                  work={work}
                  status={browserWorkStatus(snapshot, work.id)}
                  discardable={
                    snapshot.drafts.has(work.id) &&
                    snapshot.generation?.workId !== work.id &&
                    !snapshot.saving
                  }
                  onOpen={() => onOpen(work.id)}
                  onDiscard={() => setDiscardId(work.id)}
                />
              ))}
            </ul>
          )}
        </section>
      </Page>
      {discardId ? (
        <Alert
          title="舍弃未保存的修改？"
          active={current}
          onDismiss={() => setDiscardId(null)}
          actions={[
            { label: "取消", onClick: () => setDiscardId(null) },
            {
              label: "舍弃",
              primary: true,
              onClick: () => {
                onDiscard(discardId);
                setDiscardId(null);
              },
            },
          ]}
        >
          {discardedSaved
            ? `「${discarded?.title || "未命名作品"}」未保存的标题、源码和创作对话会丢失，已保存版本保留。`
            : `「${discarded?.title || "未命名作品"}」还没有保存版本，舍弃后会从列表移除。`}
        </Alert>
      ) : null}
    </>
  );
}

function WorkCard({
  work,
  status,
  discardable,
  onOpen,
  onDiscard,
}: {
  work: WebsiteWork;
  status: ReturnType<typeof browserWorkStatus>;
  discardable: boolean;
  onOpen: () => void;
  onDiscard: () => void;
}) {
  const title = work.title || "未命名作品";
  const versions = work.versions.length;
  return (
    <li className="browser-work-item">
      <button type="button" className="browser-work" onClick={onOpen}>
        <span className="browser-work-chrome">
          <span className="browser-work-lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="browser-work-url" aria-hidden="true">
            {work.author.name} / {title}
          </span>
          <BrowserStatusPill status={status} />
        </span>
        <span className="browser-work-body">
          <span className="browser-work-title">{title}</span>
          <span className="browser-work-meta">
            {work.author.name} · {versions ? `已保存 ${versions} 个版本` : "尚无保存版本"}
          </span>
        </span>
      </button>
      {discardable ? (
        <Button variant="danger" className="browser-work-discard" onClick={onDiscard}>
          舍弃草稿
        </Button>
      ) : null}
    </li>
  );
}
