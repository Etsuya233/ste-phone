import { useEffect, useRef, useState } from "react";
import type { PhoneContextPreset, PhoneContextService } from "../public.ts";
import type { ContextDraft } from "./phone-context-fields.tsx";

export function useContextEditor(
  service: PhoneContextService,
  preset: PhoneContextPreset | null,
  onBack: () => void,
) {
  const sources = service.listSources();
  const chatId = useRef(service.getSnapshot().chatId).current;
  const [draft, setDraft] = useState<ContextDraft>(() => ({
    id: preset?.id ?? "",
    name: preset?.name ?? "",
    sourceId: preset?.sourceId ?? sources[0]!.id,
    intentId: preset?.intentId ?? "",
  }));
  const initialDraft = useRef(JSON.stringify(draft)).current;
  const [options, setOptions] = useState<{
    intents: readonly { id: string; name: string }[];
    error: string;
  }>(() => {
    try {
      return { intents: service.listIntents(draft.sourceId), error: "" };
    } catch (error) {
      return { intents: [], error: error instanceof Error ? error.message : String(error) };
    }
  });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"discard" | "delete" | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function readDraft(): PhoneContextPreset {
    if (service.getSnapshot().chatId !== chatId) {
      throw new Error("当前 ST 聊天已变化，请重新打开宏绑定");
    }
    return {
      id: draft.id.trim(),
      name: draft.name.trim(),
      sourceId: draft.sourceId,
      intentId: draft.intentId,
    };
  }
  function change(patch: Partial<ContextDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setError("");
    setNotice("");
  }
  function selectSource(sourceId: string) {
    change({ sourceId, intentId: "" });
    try {
      setOptions({ intents: service.listIntents(sourceId), error: "" });
    } catch (failure) {
      setOptions({
        intents: [],
        error: failure instanceof Error ? failure.message : String(failure),
      });
    }
  }
  async function save(remove = false) {
    setBusy(true);
    setError("");
    try {
      const value = readDraft();
      if (!preset && service.getSnapshot().presets.some(({ id }) => id === value.id)) {
        throw new Error("宏标识已存在，请使用另一个标识");
      }
      await (remove ? service.remove(value.id) : service.save(value));
      // 保存继续归属原聊天；卸载或切聊天后的结果不能导航到新聊天页面。
      if (mounted.current && service.getSnapshot().chatId === chatId) {
        onBack();
      }
    } catch (failure) {
      if (mounted.current) {
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    } finally {
      if (mounted.current) {
        setBusy(false);
        setConfirmation(null);
      }
    }
  }
  async function copyMacro() {
    try {
      await navigator.clipboard.writeText(`{{phone::${preset!.id}}}`);
      if (mounted.current) {
        setNotice("宏已复制");
      }
    } catch (failure) {
      if (mounted.current) {
        setError(
          `复制失败，可选中下方宏手动复制：${failure instanceof Error ? failure.message : String(failure)}`,
        );
      }
    }
  }
  return {
    draft,
    sources,
    intents: options.intents,
    error: error || options.error,
    notice,
    busy,
    confirmation,
    dirty: JSON.stringify(draft) !== initialDraft,
    change,
    selectSource,
    readDraft,
    save,
    copyMacro,
    setConfirmation,
    setError,
  };
}
