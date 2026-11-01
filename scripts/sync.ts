import { DIST_DIR } from "./build-lib.ts";
import { resolveExtensionTarget, syncExtension } from "./extension-target.ts";

const target = resolveExtensionTarget(process.env);
if (!target) {
  throw new Error("请在 .env 配置 ST 安装目录，参考 .env.example");
}
syncExtension(DIST_DIR, target);
