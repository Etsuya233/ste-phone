import { useEffect, useRef, useState } from "react";
import {
  Button,
  NavBar,
  NavBarActionGroup,
  Page,
} from "../../../frontend/foundation/foundation.tsx";
import type { BrowserService, BrowserSnapshot } from "../browser-service.ts";
import type { WebsiteSource, WebsiteWork } from "../browser.ts";
import {
  BrowserChatIcon,
  BrowserCodeIcon,
  BrowserCompassIcon,
  BrowserGlobeIcon,
  BrowserHistoryIcon,
  BrowserStopIcon,
} from "./browser-icons.tsx";
import { browserWorkStatus, BrowserStatusPill } from "./browser-status.tsx";
import { websiteDocument } from "./website-document.ts";

export function BrowserPreview({
  work,
  snapshot,
  service,
  onBack,
  current,
  backLabel,
  onChat,
  onSource,
  onVersions,
}: {
  work: WebsiteWork;
  snapshot: BrowserSnapshot;
  service: BrowserService;
  onBack: () => void;
  current: boolean;
  backLabel: string;
  onChat: () => void;
  onSource: () => void;
  onVersions: () => void;
}) {
  const [error, setError] = useState("");
  const [stopped, setStopped] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const preview = useRef<HTMLIFrameElement>(null);
  const applied = useRef<{ frame: HTMLIFrameElement; source: WebsiteSource } | null>(null);
  useEffect(() => {
    // 源码页的连续编辑不重启后台预览，回到预览才应用新源码。
    const frame = preview.current;
    if (!current || !frame) {
      return;
    }
    const { source } = work;
    const previous = applied.current;
    if (
      previous?.frame === frame &&
      previous.source.html === source.html &&
      previous.source.css === source.css &&
      previous.source.js === source.js
    ) {
      return;
    }
    frame.srcdoc = websiteDocument(source);
    applied.current = { frame, source };
  }, [current, work.source]);

  const status = browserWorkStatus(snapshot, work.id);
  const draft = snapshot.drafts.has(work.id);
  const generating = status === "generating";
  const saving = snapshot.saving === work.id;
  const busy = generating || !!snapshot.saving;
  const hasSource = Object.values(work.source).some(Boolean);
  const message = error || snapshot.error;
  const title = work.title || "未命名作品";
  // 新一轮创作开始时移除上一次的停止说明。
  useEffect(() => {
    if (generating) {
      setStopped(false);
    }
  }, [generating]);

  return (
    <Page
      className={`browser-page browser-preview-page${fullscreen ? " browser-preview-page--fullscreen" : ""}`}
      navBar={
        <NavBar
          title={title}
          back={{ label: backLabel, onClick: onBack }}
          right={
            <NavBarActionGroup label="网页操作">
              <Button
                aria-label={fullscreen ? "退出全屏预览" : "全屏预览"}
                aria-pressed={fullscreen}
                disabled={!hasSource}
                onClick={() => setFullscreen((value) => !value)}
              >
                {fullscreen ? "还原" : "全屏"}
              </Button>
              {generating ? (
                <Button
                  variant="danger"
                  onClick={() => {
                    service.stop();
                    setStopped(true);
                  }}
                >
                  停止
                </Button>
              ) : (
                <Button
                  disabled={!draft || !work.title.trim() || busy}
                  onClick={() => {
                    setError("");
                    void service
                      .save(work.id)
                      .then(() => setError(""))
                      .catch((cause: Error) => setError(cause.message));
                  }}
                >
                  {saving ? "保存中" : "保存"}
                </Button>
              )}
            </NavBarActionGroup>
          }
        />
      }
      footerHeight={fullscreen ? 0 : 60}
      footer={
        fullscreen ? null : (
          <div className="browser-preview-actions">
            <Button variant="filled" className="browser-preview-action" onClick={onChat}>
              <BrowserChatIcon />
              <span>创作对话</span>
            </Button>
            <Button className="browser-preview-action" onClick={onSource}>
              <BrowserCodeIcon />
              <span>源码</span>
            </Button>
            <Button className="browser-preview-action" onClick={onVersions}>
              <BrowserHistoryIcon />
              <span>版本</span>
            </Button>
          </div>
        )
      }
    >
      <div className="browser-preview">
        <div className="browser-preview-chrome">
          <span className="browser-preview-lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="browser-preview-address">
            <BrowserGlobeIcon className="browser-preview-address-icon" />
            <span className="browser-preview-url">
              {work.author.name} / {title}
            </span>
          </span>
          <BrowserStatusPill status={status} live />
          {generating ? <span className="browser-preview-progress" aria-hidden="true" /> : null}
        </div>

        {stopped && !generating ? (
          <p className="browser-stopped" role="status">
            已停止本次创作，现有内容没有改动。
          </p>
        ) : null}

        {message ? (
          <p className="browser-alert browser-preview-alert" role="alert">
            {message}
          </p>
        ) : null}

        {hasSource ? (
          <div className="browser-preview-frame">
            <iframe
              className="browser-preview-frame-page"
              title={`${title}网页预览`}
              ref={preview}
            />
          </div>
        ) : (
          <div className="browser-preview-empty">
            <div className="browser-empty-art" aria-hidden="true">
              <span className="browser-empty-lights">
                <i />
                <i />
                <i />
              </span>
              <BrowserCompassIcon className="browser-empty-globe" />
            </div>
            <h2>这页还是空白</h2>
            <p>打开创作对话，让{work.author.name}写出第一版；也可以直接编辑源码。</p>
            {generating ? (
              <span className="browser-preview-wait">
                <BrowserStopIcon />
                正在创作，完成后会自动出现在这里
              </span>
            ) : null}
          </div>
        )}
      </div>
    </Page>
  );
}
