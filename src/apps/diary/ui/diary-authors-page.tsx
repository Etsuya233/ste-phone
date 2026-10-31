import { useEffect, useState } from "react";
import { isDiaryRunning } from "../diary.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";

export function DiaryAuthorsPage({ diary, state, navigation }: DiaryPageProps) {
  const [error, setError] = useState<string | null>(null);
  const busy = state.preparing || isDiaryRunning(state.generation);
  useEffect(() => {
    if (navigation.current) void diary.prepare();
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
      title="日记作者"
      onBack={navigation.pop}
      error={error}
      right={
        <Button disabled={busy} onClick={() => void diary.prepare()}>
          刷新
        </Button>
      }
    >
      <GroupedList title="选择一位人物" description="之后的日记将以这位人物的第一人称书写。">
        {state.preparing ? <p className="diary-message">正在读取人物…</p> : null}
        {state.authors.map((author) => (
          <ListCell
            key={author.id}
            title={author.name}
            subtitle={author.profileText}
            value={state.data.author?.id === author.id ? "✓" : undefined}
            disabled={busy}
            onClick={() => void selectAuthor(author.id)}
          />
        ))}
        {!state.authors.length && !state.preparing ? (
          <p className="diary-message">当前资料中没有可选人物。</p>
        ) : null}
      </GroupedList>
    </DiaryPage>
  );
}
