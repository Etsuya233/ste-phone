import { useEffect, useState } from "react";
import { isDiaryRunning } from "../diary.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";
import { DiaryAvatar } from "./diary-paper.tsx";

export function DiaryAuthorsPage({ diary, state, navigation }: DiaryPageProps) {
  const [error, setError] = useState<string | null>(null);
  const busy = state.preparing || isDiaryRunning(state.generation);

  useEffect(() => {
    if (navigation.current) {
      void diary.prepare();
    }
  }, [diary, navigation.current]);

  async function selectAuthor(id: string) {
    setError(null);
    try {
      await diary.selectAuthor(id);
      navigation.pop();
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  return (
    <DiaryPage
      state={state}
      title="谁来执笔"
      backLabel="返回"
      onBack={navigation.pop}
      error={error}
      right={
        <Button disabled={busy} onClick={() => void diary.prepare()}>
          刷新
        </Button>
      }
    >
      <div className="diary-authors">
        <header className="diary-authors-heading">
          <p className="diary-eyebrow">执笔的人</p>
          <h2>选一位人物</h2>
          <p>之后的日记会以 TA 的第一人称，记下这个世界的日常。</p>
        </header>

        <div className="diary-author-list" role="radiogroup" aria-label="日记作者">
          {state.authors.map((author) => {
            const selected =
              state.data.author?.sourceId === author.sourceId &&
              state.data.author.scopeId === author.scopeId &&
              state.data.author.id === author.id;
            return (
              <label
                key={author.id}
                className={`diary-author-option${selected ? " diary-author-option--selected" : ""}`}
              >
                <input
                  type="radio"
                  name="diary-author"
                  value={author.id}
                  checked={selected}
                  disabled={busy}
                  onChange={() => void selectAuthor(author.id)}
                />
                <DiaryAvatar name={author.name} size="medium" />
                <span className="diary-author-copy">
                  <span className="diary-author-name">
                    {author.name}
                    {selected ? <span className="diary-author-current">正在执笔</span> : null}
                  </span>
                  <span className="diary-author-profile">{author.profileText}</span>
                </span>
                <span className="diary-author-mark" aria-hidden="true">
                  {selected ? "✓" : ""}
                </span>
              </label>
            );
          })}
        </div>

        {state.preparing ? <p className="diary-message">正在读取人物…</p> : null}
        {!state.authors.length && !state.preparing ? (
          <p className="diary-message">当前资料中没有可选人物。</p>
        ) : null}
        <p className="diary-authors-note">切换作者只影响下一次落笔，旧日记会保留当时的署名。</p>
      </div>
    </DiaryPage>
  );
}
