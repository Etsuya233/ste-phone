import type { ImageHub } from "../../core/image-hub/public.ts";

interface HubApi extends ImageHub {
  readonly version: number;
}
declare global {
  interface Window {
    ST_IMAGE_HUB_API?: HubApi;
  }
}

/** 每次操作才读取 API，允许 Hub 稍后加载，缺失能力不阻断手机启动。 */
export function createStImageHub(
  readApi: () => HubApi | undefined = () => window.ST_IMAGE_HUB_API,
): ImageHub {
  function api(): HubApi {
    const value = readApi();
    if (!value) {
      throw new Error("请安装并启用 ST Image Hub，再刷新 SillyTavern。");
    }
    if (value.version !== 1) {
      throw new Error("ST Image Hub API 版本不兼容，请更新插件。");
    }
    return value;
  }
  return {
    listImages: async () => api().listImages(),
    generate: async (input) => api().generate(input),
  };
}
