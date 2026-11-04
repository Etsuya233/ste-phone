export interface MigrationStep {
  readonly from: number;
  readonly to: number;
  readonly name: string;
  readonly migrate: (data: unknown) => unknown;
}

export interface MigrationPlan<T extends { readonly version: number }> {
  readonly currentVersion: T["version"];
  readonly steps: readonly MigrationStep[];
  readonly validate: (data: unknown) => asserts data is T;
}

export interface MigrationResult<T> {
  readonly data: T;
  readonly executed: readonly {
    readonly from: number;
    readonly to: number;
    readonly name: string;
  }[];
}

/** 每个数据块独立升级；只处理副本，保存与缺数据时的默认值由调用方决定。 */
export function migrateData<T extends { readonly version: number }>(
  raw: unknown,
  plan: MigrationPlan<T>,
): MigrationResult<T> {
  const steps = migrationPaths(plan);
  let data = structuredClone(dataObject(raw));
  if (!Number.isSafeInteger(data.version) || (data.version as number) <= 0) {
    throw new Error("数据版本必须为正安全整数");
  }
  if ((data.version as number) > plan.currentVersion) {
    throw new Error(`数据版本 ${data.version} 高于当前支持版本 ${plan.currentVersion}`);
  }
  const executed: { from: number; to: number; name: string }[] = [];
  while (data.version !== plan.currentVersion) {
    const step = steps.get(data.version as number);
    if (!step) {
      throw new Error(`数据版本 ${data.version} 缺少到 ${plan.currentVersion} 的迁移路径`);
    }
    try {
      const next = dataObject(step.migrate(data));
      // 步骤只负责内容转换，目标版本由执行器统一推进。
      data = { ...next, version: step.to };
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      throw new Error(`数据迁移 ${step.name}（${step.from} → ${step.to}）失败：${detail}`, {
        cause,
      });
    }
    executed.push({ from: step.from, to: step.to, name: step.name });
  }
  plan.validate(data);
  return { data, executed };
}

/** 允许明确跳跃的历史路径；提前检查全部定义，避免坏分支只在旧用户载入时暴露。 */
function migrationPaths<T extends { readonly version: number }>(
  plan: MigrationPlan<T>,
): ReadonlyMap<number, MigrationStep> {
  if (!Number.isSafeInteger(plan.currentVersion) || plan.currentVersion <= 0) {
    throw new Error("当前数据版本必须为正安全整数");
  }
  const steps = new Map<number, MigrationStep>();
  for (const step of plan.steps) {
    if (
      !Number.isSafeInteger(step.from) ||
      step.from <= 0 ||
      !Number.isSafeInteger(step.to) ||
      step.to <= step.from ||
      step.to > plan.currentVersion ||
      typeof step.name !== "string" ||
      !step.name.trim() ||
      typeof step.migrate !== "function"
    ) {
      throw new Error(`迁移定义无效：${step.name}（${step.from} → ${step.to}）`);
    }
    if (steps.has(step.from)) {
      throw new Error(`数据版本 ${step.from} 存在重复迁移起点`);
    }
    steps.set(step.from, step);
  }
  for (const start of steps.keys()) {
    let version = start;
    while (version !== plan.currentVersion) {
      const step = steps.get(version);
      if (!step) {
        throw new Error(`数据版本 ${start} 的迁移路径在版本 ${version} 中断`);
      }
      version = step.to;
    }
  }
  return steps;
}

function dataObject(value: unknown): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error("迁移数据必须为普通对象");
  }
  return value as Record<string, unknown>;
}
