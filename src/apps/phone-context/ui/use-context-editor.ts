import { useEffect, useRef, useState } from "react";
import type { ContextScope } from "../../../core/phone-context/public.ts";
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
    scopeId: preset?.selection.scopeId ?? "",
    personIds: preset?.selection.personIds ?? [],
    recentMinutes: String(preset?.selection.recentMinutes ?? 30),
    unlimitedTime: preset?.selection.recentMinutes === null,
    limitPerGroup: String(preset?.selection.limitPerGroup ?? 50),
  }));
  const initialDraft = useRef(JSON.stringify(draft)).current;
  const [options, setOptions] = useState<{ scopes: readonly ContextScope[]; error: string }>(() => {
    try {
      return { scopes: service.listScopes(draft.sourceId), error: "" };
    } catch (error) {
      return { scopes: [], error: error instanceof Error ? error.message : String(error) };
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
      throw new Error("当前 ST 聊天已变化，请重新打开预设");
    }
    return {
      id: draft.id.trim(),
      name: draft.name.trim(),
      sourceId: draft.sourceId,
      selection: {
        scopeId: draft.scopeId,
        personIds: draft.personIds,
        recentMinutes: draft.unlimitedTime ? null : Number(draft.recentMinutes),
        limitPerGroup: Number(draft.limitPerGroup),
      },
    };
  }
  function change(patch: Partial<ContextDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setError("");
    setNotice("");
  }
  function selectSource(sourceId: string) {
    change({ sourceId, scopeId: "", personIds: [] });
    try {
      setOptions({ scopes: service.listScopes(sourceId), error: "" });
    } catch (failure) {
      setOptions({
        scopes: [],
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
    scopes: options.scopes,
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
