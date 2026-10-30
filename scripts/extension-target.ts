import { copyFileSync, existsSync, lstatSync, mkdirSync, realpathSync } from "node:fs";
import path from "node:path";
import { DIST_FILES, PACKAGE_ROOT, removeObsoleteAssets } from "./build-lib.ts";

const envPath = path.join(PACKAGE_ROOT, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

export function resolveExtensionTarget(env: NodeJS.ProcessEnv): string | undefined {
  const direct = env.STE_ST_EXTENSION_DIR?.trim();
  const install = env.STE_ST_INSTALL?.trim();
  if (direct && install) throw new Error("STE_ST_EXTENSION_DIR 与 STE_ST_INSTALL 只能配置一个");
  if (direct) return path.resolve(PACKAGE_ROOT, direct);
  if (install) {
    return path.resolve(PACKAGE_ROOT, install, "public/scripts/extensions/third-party/ste-phone");
  }
  return undefined;
}

export function syncExtension(distDir: string, targetDir: string): void {
  const dist = realpathSync(distDir);
  const targetStat = lstatSync(targetDir, { throwIfNoEntry: false });
  if (targetStat?.isSymbolicLink()) {
    if (realpathSync(targetDir) !== dist) throw new Error("扩展目录的链接指向其他位置");
    console.info("[STE Phone] Junction 直连，跳过拷贝");
    return;
  }
  const target = targetStat ? realpathSync(targetDir) : path.resolve(targetDir);
  if (
    [path.relative(dist, target), path.relative(target, dist)].some(
      (relative) =>
        relative === "" ||
        (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`)),
    )
  ) {
    throw new Error("扩展目标目录与 dist 必须相互独立");
  }
  for (const file of DIST_FILES) {
    if (!existsSync(path.join(dist, file))) throw new Error(`缺少构建产物：${file}`);
  }
  mkdirSync(target, { recursive: true });
  removeObsoleteAssets(target);
  for (const file of DIST_FILES) copyFileSync(path.join(dist, file), path.join(target, file));
  console.info(`[STE Phone] 已同步至 ${target}`);
}
