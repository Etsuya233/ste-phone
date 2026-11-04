import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageHub, ImageRecord } from "../../../core/image-hub/public.ts";

export type GalleryImagesState =
  | { readonly status: "loading" }
  | { readonly status: "error"; readonly message: string }
  | {
      readonly status: "ready";
      readonly images: readonly ImageRecord[];
      readonly error: string | null;
      readonly refreshing: boolean;
    };

/**
 * 图库读取归页面所有。刷新在已有图片时就地标记，不清空网格；
 * 每次读取带序号，卸载或更新的读取完成后丢弃自己的结果。
 */
export function useGalleryImages(hub: ImageHub, active: boolean) {
  const [state, setState] = useState<GalleryImagesState>({ status: "loading" });
  const latestRead = useRef(0);
  const mounted = useRef(false);
  const wasActive = useRef(active);

  const read = useCallback(
    async (kind: "initial" | "refresh" | "silent") => {
      const readId = ++latestRead.current;
      if (kind === "refresh") {
        setState((previous) =>
          previous.status === "ready"
            ? { ...previous, error: null, refreshing: true }
            : { status: "loading" },
        );
      }
      try {
        const images = await hub.listImages();
        if (mounted.current && readId === latestRead.current) {
          setState({ status: "ready", images, error: null, refreshing: false });
        }
      } catch (error) {
        if (mounted.current && readId === latestRead.current) {
          const message = error instanceof Error ? error.message : String(error);
          setState((previous) =>
            previous.status === "ready"
              ? { ...previous, error: message, refreshing: false }
              : { status: "error", message },
          );
        }
      }
    },
    [hub],
  );

  useEffect(() => {
    mounted.current = true;
    void read("initial");
    return () => {
      mounted.current = false;
      latestRead.current += 1;
    };
  }, [read]);

  useEffect(() => {
    // 首次挂载已有 initial 读取；只处理从后台回到前台的静默重读。
    if (!wasActive.current && active) {
      void read("silent");
    }
    wasActive.current = active;
  }, [active, read]);

  const refresh = () => {
    void read("refresh");
  };
  const loading = state.status === "loading";
  const refreshing = state.status === "ready" && state.refreshing;
  return { state, loading, refreshing, refresh };
}
