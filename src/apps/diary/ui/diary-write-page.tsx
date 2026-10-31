import { useEffect } from "react";
import { isDiaryRunning } from "../diary.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";
import { DiaryEntryPage, DiaryText } from "./diary-entry-page.tsx";

export function DiaryWritePage(props: DiaryPageProps) {
  const { diary, state, navigation } = props;
  const { generation } = state;
  const busy = state.preparing || isDiaryRunning(generation);
  useEffect(() => {
    if (navigation.current) void diary.prepare();
  }, [diary, navigation.current]);
  if (generation.status === "complete")
    return (
      <DiaryEntryPage {...props} entry={generation.entry} onWrite={() => void diary.generate()} />
    );

  return (
    <DiaryPage state={state} title="写日记" onBack={navigation.pop}>
      <GroupedList>
        <ListCell
          title="作者"
          value={state.data.author?.name ?? "选择人物"}
          disabled={busy}
          onClick={() => navigation.push({ page: "authors" })}
        />
        <ListCell title="此刻" subtitle={state.worldTime ?? "尚未取得世界时间"} />
      </GroupedList>
      <div className="diary-write-actions">
        {busy ? (
          <Button
            variant="danger"
            disabled={generation.status === "saving"}
            onClick={() => diary.cancel()}
          >
            {generation.status === "saving" ? "正在保存…" : "取消生成"}
          </Button>
        ) : (
          <Button
            variant="filled"
            disabled={!state.chatId || !state.data.author}
            onClick={() => void diary.generate()}
          >
            生成日记
          </Button>
        )}
      </div>
      {state.preparing || generation.status === "reading" ? (
        <p className="diary-message" role="status">
          正在读取资料…
        </p>
      ) : null}
      {state.notice ? <p className="diary-message">{state.notice}</p> : null}
      <WritingBody {...props} />
    </DiaryPage>
  );
}

function WritingBody({ diary, state }: DiaryPageProps) {
  const generation = state.generation;
  switch (generation.status) {
    case "save-error":
      return (
        <>
          <p className="diary-message diary-error">正文已生成，保存失败。</p>
          <div className="diary-write-actions">
            <Button onClick={() => void diary.retrySave()}>重新保存</Button>
          </div>
          <DiaryText body={generation.entry.body} />
        </>
      );
    case "saving":
      return <DiaryText body={generation.entry.body} />;
    case "generating":
      return generation.text ? <DiaryText body={generation.text} /> : null;
    default:
      return <p className="diary-message">结合当前处境和最近的经历，写下此刻的日记。</p>;
  }
}
