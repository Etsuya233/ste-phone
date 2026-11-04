import { useCallback, useEffect, useRef, useState } from "react";
import type { ImageHub, ImageRecord } from "../../../core/image-hub/public.ts";

/** 最近作品最多展示 12 张，生成结果只在页面内合并，不要求 Hub 重读。 */
const RECENTS_LIMIT = 12;

/** 生成阶段与提交时固定的描述；idle 表示还没有提交过描述，ready 额外持有本批图片。 */
export type GenerationState =
  | { status: "idle" }
  | { status: "generating"; prompt: string }
  | { status: "error"; prompt: string; message: string }
  | { status: "ready"; prompt: string; images: readonly ImageRecord[] };

export type RecentsState =
  | { status: "loading" }
  | { status: "ready"; images: readonly ImageRecord[] }
  | { status: "error"; message: string };

function describeError(error: unknown) {
  return String(error instanceof Error ? error.message : error);
}

/** 新生成的图片排在旧作品之前，按 id 去重；Hub 返回顺序即新到旧。 */
function mergeRecentImages(current: RecentsState, added: readonly ImageRecord[]): RecentsState {
  const previous = current.status === "ready" ? current.images : [];
  const seen = new Set<string>();
  const images: ImageRecord[] = [];
  for (const image of [...added, ...previous]) {
    if (seen.has(image.id)) {
      continue;
    }
    seen.add(image.id);
    images.push(image);
  }
  return { status: "ready", images: images.slice(0, RECENTS_LIMIT) };
}

/** 最近作品的读取只在前台进行；刷新期间保留旧数据，失败且无数据时才暴露错误。 */
function useRecentImages(hub: ImageHub, active: boolean) {
  const [recents, setRecents] = useState<RecentsState>({ status: "loading" });
  const attached = useRef(true);
  const wasActive = useRef(active);
  const latestRead = useRef(0);
  const merged = useRef(0);

  const read = useCallback(async () => {
    const readId = ++latestRead.current;
    const mergedBeforeRead = merged.current;
    try {
      const images = await hub.listImages();
      // 生成结果已合并时不回退到读取前的列表；下一次前台恢复会重新对齐 Hub。
      if (
        attached.current &&
        readId === latestRead.current &&
        mergedBeforeRead === merged.current
      ) {
        setRecents({ status: "ready", images: images.slice(0, RECENTS_LIMIT) });
      }
    } catch (error) {
      if (!attached.current || readId !== latestRead.current) {
        return;
      }
      setRecents((current) =>
        current.status === "ready" ? current : { status: "error", message: describeError(error) },
      );
    }
  }, [hub]);

  useEffect(() => {
    attached.current = true;
    return () => {
      attached.current = false;
      latestRead.current += 1;
    };
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  useEffect(() => {
    const resumed = active && !wasActive.current;
    wasActive.current = active;
    if (resumed) {
      void read();
    }
  }, [active, read]);

  function mergeGenerated(images: readonly ImageRecord[]) {
    merged.current += 1;
    setRecents((current) => mergeRecentImages(current, images));
  }

  return { state: recents, reload: read, mergeGenerated };
}

/** 生成任务固定提交时的描述；卸载只忽略迟到展示，Hub 任务继续。 */
function useGeneration(hub: ImageHub, onGenerated: (images: readonly ImageRecord[]) => void) {
  const [prompt, setPrompt] = useState("");
  const [generation, setGeneration] = useState<GenerationState>({ status: "idle" });
  const attached = useRef(true);
  const generating = useRef(false);

  useEffect(() => {
    attached.current = true;
    return () => {
      attached.current = false;
    };
  }, []);

  async function run(description: string) {
    if (generating.current) {
      return;
    }
    generating.current = true;
    setGeneration({ status: "generating", prompt: description });
    try {
      const images = await hub.generate({ prompt: description });
      if (!attached.current) {
        return;
      }
      setGeneration({ status: "ready", prompt: description, images });
      onGenerated(images);
    } catch (error) {
      if (attached.current) {
        setGeneration({ status: "error", prompt: description, message: describeError(error) });
      }
    } finally {
      generating.current = false;
    }
  }

  function submit() {
    const description = prompt.trim();
    if (description) {
      void run(description);
    }
  }

  function drawAgain() {
    if (generation.status === "ready" || generation.status === "error") {
      void run(generation.prompt);
    }
  }

  return { prompt, setPrompt, generation, submit, drawAgain };
}

export function usePlayground(hub: ImageHub, active: boolean) {
  const recents = useRecentImages(hub, active);
  const generation = useGeneration(hub, recents.mergeGenerated);
  return {
    prompt: generation.prompt,
    setPrompt: generation.setPrompt,
    generation: generation.generation,
    recents: recents.state,
    submit: generation.submit,
    drawAgain: generation.drawAgain,
    reloadRecents: recents.reload,
  };
}
