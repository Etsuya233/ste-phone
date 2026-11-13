import { useState } from "react";
import {
  Button,
  NavBar,
  NavBarActionGroup,
  Page,
} from "../../../frontend/foundation/foundation.tsx";
import type { BrowserService, BrowserSnapshot } from "../browser-service.ts";
import type { WebsiteWork } from "../browser.ts";
import { BrowserHistoryIcon } from "./browser-icons.tsx";

function formatSavedAt(savedAt: string): string {
  return new Date(savedAt).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BrowserVersions({
  work,
  snapshot,
  service,
  onBack,
}: {
  work: WebsiteWork;
  snapshot: BrowserSnapshot;
  service: BrowserService;
  onBack: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState("");
  const generating = snapshot.generation?.workId === work.id;
  const busy = !!snapshot.saving || generating;
  const draft = snapshot.drafts.has(work.id);
  return (
    <Page
      className="browser-page browser-versions-page"
      largeTitle="版本历史"
      navBar={
        <NavBar
          title="版本历史"
          back={{ label: "预览", onClick: onBack }}
          right={
            generating ? (
              <NavBarActionGroup label="停止创作">
                <Button variant="danger" onClick={service.stop}>
                  停止
                </Button>
              </NavBarActionGroup>
            ) : undefined
          }
        />
      }
    >
      <section className="browser-versions">
        <p className="browser-versions-lead">
          每次保存都会留下一个快照。恢复只写入草稿，保存后才会成为新版本。
        </p>
        {draft ? (
          <p className="browser-versions-note">
            当前有未保存修改。恢复会覆盖草稿中的标题和源码，创作对话保留。
          </p>
        ) : null}
        {busy ? (
          <p className="browser-versions-note" role="status">
            {generating ? "正在创作，完成或停止后可以恢复版本。" : "正在保存，完成后可以恢复版本。"}
          </p>
        ) : null}
        {error ? (
          <p className="browser-alert" role="alert">
            {error}
          </p>
        ) : null}

        {work.versions.length ? (
          <ul className="browser-version-list">
            {work.versions
              .map((version, index) => ({ version, index }))
              .reverse()
              .map(({ version, index }) => (
                <li key={index} className="browser-version-item">
                  <button
                    type="button"
                    className="browser-version"
                    aria-pressed={selected === index}
                    disabled={busy}
                    onClick={() => setSelected(selected === index ? null : index)}
                  >
                    <span className="browser-version-number">第 {index + 1} 版</span>
                    <span className="browser-version-copy">
                      <span className="browser-version-title">{version.title || "未命名作品"}</span>
                      <span className="browser-version-time">{formatSavedAt(version.savedAt)}</span>
                    </span>
                    {index === work.versions.length - 1 ? (
                      <span className="browser-version-latest">最新</span>
                    ) : null}
                  </button>
                  {selected === index ? (
                    <div className="browser-version-restore">
                      <p>将第 {index + 1} 版恢复到当前草稿。已保存版本和创作对话不会被删除。</p>
                      <div className="browser-version-actions">
                        <Button onClick={() => setSelected(null)}>取消</Button>
                        <Button
                          variant="filled"
                          disabled={busy}
                          onClick={() => {
                            try {
                              service.restore(work.id, version);
                              onBack();
                            } catch (cause) {
                              setError((cause as Error).message);
                            }
                          }}
                        >
                          恢复此版本
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              ))}
          </ul>
        ) : (
          <div className="browser-empty">
            <BrowserHistoryIcon className="browser-empty-glyph" />
            <h2>还没有保存版本</h2>
            <p>在预览页保存一次后，这里会按时间保留快照。</p>
          </div>
        )}
      </section>
    </Page>
  );
}
