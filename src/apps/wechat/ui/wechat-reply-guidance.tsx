import { useEffect, useId, useState } from "react";
import { Page } from "../../../frontend/foundation/page.tsx";
import { NavBar } from "../../../frontend/foundation/nav-bar.tsx";
import { Button } from "../../../frontend/foundation/button.tsx";
import { GroupedList } from "../../../frontend/foundation/grouped-list.tsx";
import type { WechatPageProps } from "./wechat-page.tsx";

type SaveState = { status: "editing" | "saving" | "saved" } | { status: "error"; message: string };

export function WechatReplyGuidance({
  wechat,
  state,
  navigation,
  id,
  active,
}: WechatPageProps & { id: string; active: boolean }) {
  const person = state.people.find((item) => item.id === id);
  const saved = state.data.replyGuidance?.[state.scopeId!]?.[id] ?? "";
  // 草稿属于当前聊天、帐号导航栈中的人物页，Home 和关闭手机保留，出栈或换聊天销毁。
  const [draft, setDraft] = useState(saved);
  const [save, setSave] = useState<SaveState>({ status: "editing" });
  const [discard, setDiscard] = useState(false);
  const fieldId = useId();
  const saving = save.status === "saving";
  const dirty = draft.trim() !== saved;

  useEffect(() => {
    // 保存完成时若在后台，回到该页后再返回资料页，避免后台导航或抢焦点。
    if (active && save.status === "saved") {
      navigation.pop();
    }
  }, [active, save.status, navigation]);

  async function saveGuidance() {
    setDiscard(false);
    setSave({ status: "saving" });
    try {
      await wechat.saveReplyGuidance(id, draft);
      setSave({ status: "saved" });
    } catch (error) {
      // 保存失败保留完整草稿，可继续编辑或重试。
      setSave({ status: "error", message: (error as Error).message });
    }
  }

  function requestBack() {
    if (saving) {
      return;
    }
    if (dirty) {
      setDiscard(true);
    } else {
      navigation.pop();
    }
  }

  return (
    <Page
      navBar={
        <NavBar
          title="回复指导"
          back={{ label: "资料", onClick: requestBack }}
          right={
            <Button
              disabled={!person || saving || save.status === "saved"}
              onClick={() => void saveGuidance()}
            >
              {saving ? "保存中" : "保存"}
            </Button>
          }
        />
      }
    >
      <GroupedList
        title={person?.name ?? "人物不可用"}
        description="控制该人物在微信中的 AI 回复，保存后从下一次生成起生效。清空并保存可恢复默认表现。"
      >
        <label className="wechat-guidance-label" htmlFor={fieldId}>
          回复指导
        </label>
        <textarea
          id={fieldId}
          className="wechat-guidance-input"
          rows={8}
          value={draft}
          disabled={!person || saving || save.status === "saved"}
          placeholder="例如：多用 Emoji；不要提起某个话题；说话更加傲娇。"
          onChange={(event) => {
            setDraft(event.target.value);
            setDiscard(false);
            setSave({ status: "editing" });
          }}
        />
      </GroupedList>
      {save.status === "error" ? (
        <p className="wechat-notice" role="alert">
          {save.message}
        </p>
      ) : null}
      {discard ? (
        <GroupedList description="尚有未保存的回复指导。">
          <Button onClick={() => setDiscard(false)}>继续编辑</Button>
          <Button onClick={navigation.pop}>舍弃修改</Button>
        </GroupedList>
      ) : null}
    </Page>
  );
}
