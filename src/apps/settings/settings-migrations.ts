import type { MigrationPlan } from "../../core/storage/migrations.ts";
import type { PhoneSettings } from "./ports/settings-storage.ts";

// 历史步骤固定输出 v6；未来默认布局变化不能改写旧版本迁移的结果。
const v6Defaults = {
  version: 6 as const,
  wechatSendMode: "delayed" as const,
  wechatHistoryMessageLimit: 100,
  wallpaper: { kind: "gradient" as const },
  blur: false,
  modelConnections: [],
  defaultModelConnectionId: null,
  homeLayout: {
    grid: [
      "diary",
      "wechat",
      "database",
      "data-source",
      "logs",
      "foundation",
      "settings",
      "app-store",
      "gallery",
      "image-playground",
    ],
    dock: ["stopwatch"],
  },
};

export const phoneSettingsMigrationPlan: MigrationPlan<PhoneSettings> = {
  currentVersion: 8,
  steps: [
    ...[1, 2, 3, 4, 5].map((from) => ({
      from,
      to: 6,
      name: `settings-v${from}-to-v6`,
      migrate: migrateLegacySettings,
    })),
    {
      from: 6,
      to: 7,
      name: "settings-v6-to-v7",
      migrate: (value) => {
        const settings = settingsRecord(value);
        validateSettingsFields(settings, 6);
        validateWechatHistoryLimit(settings.wechatHistoryMessageLimit as number);
        return { ...settings, appearance: { deviceModel: "iphone-6s", systemStyle: "classic" } };
      },
    },
    {
      from: 7,
      to: 8,
      name: "settings-v7-to-v8",
      migrate: (value) => ({ ...settingsRecord(value), mapModelConnectionId: null }),
    },
  ],
  validate: validatePhoneSettings,
};

/** 保留已发布版本的直接升级路径，不重建不存在的中间格式。 */
function migrateLegacySettings(value: unknown): unknown {
  const settings = settingsRecord(value);
  const version = settings.version as number;
  validateSettingsFields(settings, version);
  if (version === 1) {
    return { ...structuredClone(v6Defaults), blur: settings.blur };
  }
  if (version === 2) {
    return {
      ...structuredClone(v6Defaults),
      wallpaper: settings.wallpaper,
      blur: settings.blur,
    };
  }
  return {
    ...settings,
    wechatHistoryMessageLimit: 100,
    wechatSendMode: version === 5 ? settings.wechatSendMode : "delayed",
    homeLayout: version === 3 ? structuredClone(v6Defaults.homeLayout) : settings.homeLayout,
  };
}

function validatePhoneSettings(value: unknown): asserts value is PhoneSettings {
  const settings = settingsRecord(value);
  if (settings.version !== 8) {
    throw new Error("不支持的手机设置版本");
  }
  validateSettingsFields(settings, 8);
  if (
    settings.mapModelConnectionId !== null &&
    (typeof settings.mapModelConnectionId !== "string" || !settings.mapModelConnectionId.trim())
  ) {
    throw new Error("地图模型连接设置无效");
  }
  validateWechatHistoryLimit(settings.wechatHistoryMessageLimit as number);
  const appearance = settingsRecord(settings.appearance);
  if (appearance.deviceModel !== "iphone-6s" && appearance.deviceModel !== "iphone-17") {
    throw new Error("不支持的手机外形");
  }
  if (appearance.systemStyle !== "classic" && appearance.systemStyle !== "ios26") {
    throw new Error("不支持的系统风格");
  }
}

/** 校验各历史阶段已经存在的字段；后续新增字段由迁移步骤显式补齐。 */
function validateSettingsFields(settings: Record<string, unknown>, version: number): void {
  if (typeof settings.blur !== "boolean") {
    throw new Error("手机设置的模糊选项无效");
  }
  const wallpaper = settingsRecord(settings.wallpaper);
  if (version === 1) {
    if (
      typeof wallpaper.kind !== "string" ||
      (wallpaper.url !== undefined && typeof wallpaper.url !== "string") ||
      (wallpaper.label !== undefined && typeof wallpaper.label !== "string") ||
      !Array.isArray(settings.savedUrls) ||
      settings.savedUrls.some((url) => typeof url !== "string")
    ) {
      throw new Error("旧手机壁纸设置无效");
    }
    return;
  }
  if (
    wallpaper.kind !== "gradient" &&
    (wallpaper.kind !== "image" || typeof wallpaper.path !== "string" || !wallpaper.path.trim())
  ) {
    throw new Error("手机壁纸设置无效");
  }
  if (version >= 3) {
    validateStoredConnections(settings);
  }
  if (version >= 4) {
    const layout = settingsRecord(settings.homeLayout);
    if (
      !Array.isArray(layout.grid) ||
      !Array.isArray(layout.dock) ||
      [...layout.grid, ...layout.dock].some((id) => typeof id !== "string")
    ) {
      throw new Error("手机桌面布局无效");
    }
  }
  if (
    version >= 5 &&
    settings.wechatSendMode !== "immediate" &&
    settings.wechatSendMode !== "delayed"
  ) {
    throw new Error("不支持的微信发送模式");
  }
}

/** 读取只检查持久结构，连接编辑时的规范化继续由模型连接模块负责。 */
function validateStoredConnections(settings: Record<string, unknown>): void {
  if (
    !Array.isArray(settings.modelConnections) ||
    (settings.defaultModelConnectionId !== null &&
      typeof settings.defaultModelConnectionId !== "string")
  ) {
    throw new Error("手机模型连接设置无效");
  }
  for (const raw of settings.modelConnections) {
    const connection = settingsRecord(raw);
    if (
      ["id", "name", "baseUrl", "apiKey", "model"].some(
        (field) => typeof connection[field] !== "string",
      ) ||
      Object.values(settingsRecord(connection.customHeaders)).some(
        (value) => typeof value !== "string",
      )
    ) {
      throw new Error("手机模型连接设置无效");
    }
  }
}

function settingsRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("手机设置数据结构无效");
  }
  return value as Record<string, unknown>;
}

export function validateWechatHistoryLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new Error("历史消息条数须为正安全整数");
  }
}
