import { context, type Plugin } from "esbuild";
import { watch } from "node:fs";
import path from "node:path";
import {
  removeObsoleteAssets,
  createBuildOptions,
  DIST_DIR,
  PACKAGE_ROOT,
  writeManifest,
} from "./build-lib.ts";
import { resolveExtensionTarget, syncExtension } from "./extension-target.ts";

const target = resolveExtensionTarget(process.env);
const sync: Plugin = {
  name: "ste-phone-sync",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) {
        return;
      }
      writeManifest();
      removeObsoleteAssets();
      if (target) {
        syncExtension(DIST_DIR, target);
      }
    });
  },
};
const ctx = await context({ ...createBuildOptions(true), plugins: [sync] });
await ctx.watch();
// manifest 与版本不在 esbuild 的源码依赖图中。
const watchers = ["manifest.json", "package.json"].map((file) =>
  watch(path.join(PACKAGE_ROOT, file), () => {
    // 版本 define 由启动时读取，修改 package 后需要重启 watch。
    if (file === "package.json") {
      console.info("[STE Phone] package.json 已修改，请重启 watch");
      return;
    }
    void ctx.rebuild().catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
  }),
);
console.info(`[STE Phone] watch 已启动，${target ? `同步至 ${target}` : "仅构建 dist"}`);
console.info("修改后刷新 ST 页面；Ctrl+C 退出。");
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    for (const watcher of watchers) {
      watcher.close();
    }
    void ctx.dispose();
  });
}
