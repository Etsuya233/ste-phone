import { useEffect, useRef, useState } from "react";
import { isDiaryRunning, type DiaryEntry, type DiarySnapshot } from "../diary.ts";
import type { DiaryService } from "../diary-service.ts";

/** 草稿属于当前编辑页，异步保存由服务固定聊天；卸载后不更新页内状态。 */
export function useImagePromptDraft(diary: DiaryService, state: DiarySnapshot, entry: DiaryEntry) {
  const [prompt, setPrompt] = useState(entry.imagePrompt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const dirty = prompt !== (entry.imagePrompt ?? "");
  const task = state.imageTask;
  const taskBusy = task.status !== "idle" && task.status !== "error";
  const busy = working || taskBusy || isDiaryRunning(state.generation) || state.preparing;
  const taskError =
    task.status === "error" && task.entryId === entry.id ? task.error.message : null;

  async function submit(generate: boolean) {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      // 先持久化用户审定的描述；保存失败时保留草稿且不发起生图。
      await diary.saveImagePrompt(entry.id, prompt);
      if (generate) {
        await diary.generateImage(entry.id);
      }
      if (mounted.current) {
        setMessage(generate ? "配图已生成，返回日记即可查看。" : "描述已保存。");
      }
    } catch (cause) {
      if (mounted.current) {
        setError((cause as Error).message);
      }
    } finally {
      if (mounted.current) {
        setWorking(false);
      }
    }
  }
  async function extract() {
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      await diary.createImagePrompt(entry.id);
      const updated = diary.getSnapshot().data.entries.find((item) => item.id === entry.id)!;
      if (mounted.current) {
        setPrompt(updated.imagePrompt!);
      }
    } catch (cause) {
      if (mounted.current) {
        setError((cause as Error).message);
      }
    } finally {
      if (mounted.current) {
        setWorking(false);
      }
    }
  }
  return {
    prompt,
    setPrompt,
    busy,
    dirty,
    task,
    error: error ?? taskError,
    message,
    submit,
    extract,
  };
}
