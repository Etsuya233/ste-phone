import { useState } from "react";
import {
  Button,
  NavBar,
  NavBarActionGroup,
  Page,
  SegmentedControl,
  TextField,
} from "../../../frontend/foundation/foundation.tsx";
import type { BrowserService, BrowserSnapshot } from "../browser-service.ts";
import type { WebsiteSource, WebsiteWork } from "../browser.ts";
import { browserWorkStatus, BrowserStatusPill } from "./browser-status.tsx";

const sourceFiles = [
  { value: "html", label: "index.html" },
  { value: "css", label: "style.css" },
  { value: "js", label: "script.js" },
] as const;

export function BrowserSource({
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
  const [file, setFile] = useState<keyof WebsiteSource>("html");
  const [error, setError] = useState("");
  const status = browserWorkStatus(snapshot, work.id);
  const generating = status === "generating";
  const saving = snapshot.saving === work.id;
  const busy = generating || !!snapshot.saving;
  const draft = snapshot.drafts.has(work.id);
  const current = sourceFiles.find((item) => item.value === file)!;
  const source = work.source[file];
  const message = error || snapshot.error;
  return (
    <Page
      className="browser-page browser-source-page"
      navBar={
        <NavBar
          title="源码"
          back={{ label: "预览", onClick: onBack }}
          right={
            generating ? (
              <NavBarActionGroup label="停止创作">
                <Button variant="danger" onClick={service.stop}>
                  停止
                </Button>
              </NavBarActionGroup>
            ) : (
              <NavBarActionGroup label="保存作品">
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
              </NavBarActionGroup>
            )
          }
        />
      }
    >
      <div className="browser-source">
        <div className="browser-source-head">
          <TextField
            label="作品标题"
            value={work.title}
            readOnly={busy}
            onChange={(event) => service.edit(work.id, { title: event.target.value })}
          />
          <div className="browser-source-state">
            <BrowserStatusPill status={status} />
            <span>
              {generating
                ? "创作中，源码暂不可编辑"
                : snapshot.saving
                  ? "保存中，源码暂不可编辑"
                  : "编辑后记得保存"}
            </span>
          </div>
        </div>

        <SegmentedControl
          label="源码文件"
          options={sourceFiles}
          value={file}
          onValueChange={setFile}
        />

        {message ? (
          <p className="browser-alert" role="alert">
            {message}
          </p>
        ) : null}

        <div className="browser-code-shell">
          <div className="browser-code-bar">
            <span className={`browser-code-dot browser-code-dot--${file}`} aria-hidden="true" />
            <span className="browser-code-name">{current.label}</span>
            <span className="browser-code-lines">{source ? source.split("\n").length : 0} 行</span>
          </div>
          <textarea
            aria-label={`${current.label} 源码`}
            className="browser-code"
            value={source}
            readOnly={busy}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            onChange={(event) =>
              service.edit(work.id, {
                source: { ...work.source, [file]: event.target.value },
              })
            }
          />
        </div>
      </div>
    </Page>
  );
}
