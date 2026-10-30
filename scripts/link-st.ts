import { DIST_DIR } from "./build-lib.ts";
import { linkExtension } from "./extension-link.ts";
import { resolveExtensionTarget } from "./extension-target.ts";

const target = resolveExtensionTarget(process.env);
if (!target) throw new Error("请在 .env 配置 ST 安装目录，参考 .env.example");
const remove = process.argv.includes("--remove");
linkExtension(DIST_DIR, target, remove);
console.info(`[STE Phone] ${remove ? "已解除链接" : "已连接"}：${target} → ${DIST_DIR}`);
