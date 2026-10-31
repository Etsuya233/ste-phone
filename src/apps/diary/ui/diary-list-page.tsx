import { isDiaryRunning } from "../diary.ts";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import { DiaryPage, type DiaryPageProps } from "./diary-page.tsx";

export function DiaryListPage({ diary, state, navigation, onHome }: DiaryPageProps) {
  const busy = state.preparing || isDiaryRunning(state.generation);
  function openWriter() {
    diary.startWriting();
    navigation.push({ page: "write" });
  }
  return (
    <DiaryPage
      state={state}
      title="日记"
      onBack={onHome}
      backLabel="主屏幕"
      right={
        <Button disabled={!state.chatId} onClick={openWriter}>
          写日记
        </Button>
      }
    >
      <GroupedList>
        <ListCell
          title="作者"
          value={state.data.author?.name ?? "选择人物"}
          disabled={!state.chatId || busy}
          onClick={() => navigation.push({ page: "authors" })}
        />
        <ListCell
          title="生成设置"
          disabled={!state.chatId || busy}
          onClick={() => navigation.push({ page: "settings" })}
        />
        {isDiaryRunning(state.generation) ? (
          <ListCell
            title={state.generation.status === "saving" ? "正在保存…" : "正在写日记…"}
            onClick={openWriter}
          />
        ) : null}
      </GroupedList>
      <GroupedList title="日记本">
        {state.data.entries.length ? (
          state.data.entries.map((item) => (
            <ListCell
              key={item.id}
              title={`${item.worldTime.split(/[T ]/)[0]} · ${item.author.name}`}
              subtitle={item.body}
              onClick={() => navigation.push({ page: "detail", id: item.id })}
            />
          ))
        ) : (
          <div className="diary-empty">
            <p>还没有日记</p>
            <p>留下一篇此刻的心情与经历。</p>
            <Button disabled={!state.chatId} onClick={openWriter}>
              写第一篇
            </Button>
          </div>
        )}
      </GroupedList>
    </DiaryPage>
  );
}
