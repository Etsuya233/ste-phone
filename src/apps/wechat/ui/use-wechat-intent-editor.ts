import { useEffect, useRef, useState } from "react";
import type { WechatIntentScope, WechatIntent, WechatIntentService } from "../public.ts";
import type { WechatIntentDraft } from "./wechat-intent-fields.tsx";

export function useWechatIntentEditor(
  service: WechatIntentService,
  preset: WechatIntent | null,
  onBack: () => void,
) {
  const chatId = useRef(service.getSnapshot().chatId).current;
  // 稳定标识仅在创建此草稿时生成，修改名称和筛选条件不会改变外部引用。
  const [id] = useState(
    () =>
      preset?.id ??
      [...crypto.getRandomValues(new Uint8Array(16))]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
  );
  const [draft, setDraft] = useState<WechatIntentDraft>(() => ({
    name: preset?.name ?? "",
    scopeId: preset?.selection.scopeId ?? "",
    personIds: preset?.selection.personIds ?? [],
    recentMinutes: String(preset?.selection.recentMinutes ?? 30),
    unlimitedTime: preset?.selection.recentMinutes === null,
    limitPerGroup: String(preset?.selection.limitPerGroup ?? 50),
  }));
  const initialDraft = useRef(JSON.stringify(draft)).current;
  const [options] = useState<{ scopes: readonly WechatIntentScope[]; error: string }>(() => {
    try {
      return { scopes: service.listScopes(), error: "" };
    } catch (error) {
      return { scopes: [], error: error instanceof Error ? error.message : String(error) };
    }
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<"discard" | "delete" | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function readDraft(): WechatIntent {
    if (service.getSnapshot().chatId !== chatId) {
      throw new Error("当前 ST 聊天已变化，请重新打开 App Intent");
    }
    return {
      id,
      name: draft.name.trim(),
      selection: {
        scopeId: draft.scopeId,
        personIds: draft.personIds,
        recentMinutes: draft.unlimitedTime ? null : Number(draft.recentMinutes),
        limitPerGroup: Number(draft.limitPerGroup),
      },
    };
  }
  function change(patch: Partial<WechatIntentDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setError("");
  }
  async function save(remove = false) {
    setBusy(true);
    setError("");
    try {
      const value = readDraft();
      await (remove ? service.remove(value.id) : service.save(value));
      // 已发出的保存归原聊天；切聊天和卸载后的结果不能导航新页面。
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
  return {
    draft,
    scopes: options.scopes,
    error: error || options.error,
    busy,
    confirmation,
    dirty: JSON.stringify(draft) !== initialDraft,
    change,
    readDraft,
    save,
    setConfirmation,
    setError,
  };
}
