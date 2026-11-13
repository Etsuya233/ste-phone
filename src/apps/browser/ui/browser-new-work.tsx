import { useEffect, useId, useState } from "react";
import { Button, NavBar, Page } from "../../../frontend/foundation/foundation.tsx";
import type { BrowserAuthor } from "../browser-authors.ts";
import type { BrowserService } from "../browser-service.ts";
import { BrowserCheckIcon, BrowserGlobeIcon } from "./browser-icons.tsx";

const profileKey =
  /^(?:name|personality|background|current_status|aliases|age|gender|occupation|appearance|relationship|summary|姓名|性格|背景|现状|别名|年龄|性别|职业|外貌|关系|简介)\s*[：:]\s*/i;

/** Memory 的人物资料常按字段逐行返回；省略标题重复的姓名，只留可比较的摘要。 */
function profileSummary(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^(?:name|姓名)\s*[：:]/i.test(line))
    .map((line) => line.replace(profileKey, ""))
    .filter(Boolean)
    .join(" · ");
}

export function BrowserNewWork({
  service,
  authorRevision,
  onBack,
  onCreate,
}: {
  service: BrowserService;
  authorRevision: number;
  onBack: () => void;
  onCreate: (id: string) => void;
}) {
  const groupName = useId();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ authors: BrowserAuthor[] } | { error: string } | null>(
    null,
  );
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setResult(null);
    service.readAuthors().then(
      (authors) => {
        if (current) {
          setResult({ authors });
        }
      },
      (cause: Error) => {
        if (current) {
          setResult({ error: cause.message });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [service, attempt]);
  const authors = result && "authors" in result ? result.authors : [];
  const author = authors.find((candidate) => candidate.id === selected) ?? null;
  return (
    <Page
      className="browser-page browser-new-page"
      largeTitle="新建网页"
      navBar={<NavBar title="新建网页" back={{ label: "作品", onClick: onBack }} />}
      footerHeight={64}
      footer={
        <div className="browser-new-footer">
          <Button
            variant="filled"
            disabled={!author}
            onClick={() => {
              if (!author) {
                return;
              }
              try {
                onCreate(
                  service.create(
                    {
                      sourceId: author.sourceId,
                      scopeId: author.scopeId,
                      id: author.id,
                      name: author.name,
                    },
                    authorRevision,
                  ),
                );
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}
          >
            开始创作
          </Button>
        </div>
      }
    >
      <section className="browser-new">
        <header className="browser-new-head">
          <p className="browser-eyebrow">选择创作者</p>
          <h2>这一页由谁来写？</h2>
          <p>网页会以角色的视角生成，并保存在当前聊天。创建后先成为草稿，保存时留下版本。</p>
        </header>

        {error ? (
          <p className="browser-alert" role="alert">
            {error}
          </p>
        ) : null}

        {!result ? (
          <div className="browser-author-loading" role="status">
            <span className="browser-spinner" aria-hidden="true" />
            正在读取人物资料…
          </div>
        ) : "error" in result ? (
          <div className="browser-alert" role="alert">
            <p>{result.error}</p>
            <Button onClick={() => setAttempt((value) => value + 1)}>重试</Button>
          </div>
        ) : authors.length ? (
          <fieldset className="browser-author-field">
            <legend className="browser-field-label">Memory 人物</legend>
            <ul className="browser-authors">
              {authors.map((candidate) => (
                <li key={candidate.id}>
                  <label className="browser-author">
                    <input
                      type="radio"
                      name={groupName}
                      value={candidate.id}
                      checked={selected === candidate.id}
                      onChange={() => {
                        setSelected(candidate.id);
                        setError("");
                      }}
                    />
                    <span className="browser-author-avatar" aria-hidden="true">
                      {candidate.name.trim().slice(0, 1) || "?"}
                    </span>
                    <span className="browser-author-copy">
                      <span className="browser-author-name">{candidate.name}</span>
                      <span className="browser-author-bio">
                        {profileSummary(candidate.profileText) || "Memory 资料中的人物"}
                      </span>
                    </span>
                    <span className="browser-author-mark" aria-hidden="true">
                      <BrowserCheckIcon />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : (
          <div className="browser-empty">
            <BrowserGlobeIcon className="browser-empty-glyph" />
            <h2>当前资料中没有人物</h2>
            <p>先在 Memory 中添加人物，再回来创作网页。</p>
          </div>
        )}
      </section>
    </Page>
  );
}
