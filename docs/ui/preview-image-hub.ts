import type { ImageHub, ImageRecord } from "../../src/core/image-hub/public.ts";

function previewImage(index: number, prompt: string): ImageRecord {
  const colors = ["#788fa0", "#a58c81", "#7c9a8b"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600"><rect width="600" height="600" fill="${colors[index % 3]}"/><circle cx="440" cy="155" r="65" fill="#f8dfaa"/><path d="M0 480 180 230 350 410 470 290 600 460V600H0Z" fill="#344d55"/><path d="M0 540 240 400 410 500 600 380V600H0Z" fill="#b8c5bd"/></svg>`;
  return {
    id: `preview-${index}`,
    imagePath: `data:image/svg+xml,${encodeURIComponent(svg)}`,
    prompt,
    startedAt: new Date(1793779200000 + index * 1000).toISOString(),
    savedAt: new Date(1793779201000 + index * 1000).toISOString(),
  };
}

/** 纯本地模拟，无真实模型、网络或 Hub 存储依赖。 */
export function createPreviewImageHub(mode: string | null): ImageHub {
  const images =
    mode === "empty"
      ? []
      : [previewImage(0, "山间晴日"), previewImage(1, "黄昏的远山"), previewImage(2, "静静的山谷")];
  return {
    async listImages() {
      if (mode === "missing") {
        throw new Error("请安装并启用 ST Image Hub，再刷新 SillyTavern。");
      }
      if (mode === "error") {
        throw new Error("模拟图库读取失败，请刷新重试。");
      }
      return [...images].reverse();
    },
    async generate({ prompt }) {
      if (mode === "missing") {
        throw new Error("请安装并启用 ST Image Hub，再刷新 SillyTavern。");
      }
      await new Promise((resolve) => setTimeout(resolve, mode === "slow" ? 8000 : 600));
      if (mode === "error") {
        throw new Error("模拟生成失败，请重试。");
      }
      const result = [
        previewImage(images.length + 3, prompt),
        previewImage(images.length + 4, prompt),
      ];
      images.push(...result);
      return result;
    },
  };
}
