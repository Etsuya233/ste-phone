import { useState, useSyncExternalStore } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { TextField } from "../../../frontend/foundation/text-field.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import { ListCell } from "../../../frontend/foundation/list-cell.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";

export function WechatSettings({ preferences, navigation }: WechatPageProps) {
  const saved = useSyncExternalStore(preferences.subscribe, preferences.getHistoryMessageLimit);
  // 页面只拥有未保存草稿，已保存值始终取全局设置。
  const [draft, setDraft] = useState(String(saved));
  const [error, setError] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  function save() {
    try {
      if (!/^\d+$/.test(draft)) {
        throw new Error("历史消息条数须为正安全整数");
      }
      preferences.setHistoryMessageLimit(Number(draft));
      setDraft(String(preferences.getHistoryMessageLimit()));
      setError(null);
      setDiscard(false);
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  function back() {
    if (draft !== String(saved)) {
      setDiscard(true);
    } else {
      navigation.pop();
    }
  }
  return (
    <Page
      navBar={
        <NavBar
          title="设置"
          back={{ label: "我", onClick: back }}
          right={<Button onClick={save}>保存</Button>}
        />
      }
    >
      <GroupedList>
        <ListCell title="App Intent" onClick={() => navigation.push({ page: "intents" })} />
      </GroupedList>
      <GroupedList description="AI 读取最近的双方消息，默认 100 条。先按记忆屏障筛选，再取最近条数；本轮获准的待回复消息完整保留，可超过此数。设置跨帐号与聊天共用，保存后从下一次生成生效。">
        <TextField
          label="AI历史消息条数"
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
            setDiscard(false);
          }}
        />
      </GroupedList>
      {error ? (
        <p className="wechat-notice" role="alert">
          {error}
        </p>
      ) : null}
      {discard ? (
        <GroupedList description="尚有未保存的历史消息条数。">
          <Button onClick={() => setDiscard(false)}>继续编辑</Button>
          <Button onClick={navigation.pop}>舍弃修改</Button>
        </GroupedList>
      ) : null}
    </Page>
  );
}
