import { lstatSync, mkdirSync, realpathSync, symlinkSync, unlinkSync } from "node:fs";
import path from "node:path";

export function linkExtension(distDir: string, targetDir: string, remove: boolean): void {
  const stat = lstatSync(targetDir, { throwIfNoEntry: false });
  if (stat) {
    if (!stat.isSymbolicLink()) throw new Error(`扩展目录已经存在，未修改：${targetDir}`);
    if (realpathSync(targetDir) !== realpathSync(distDir)) {
      throw new Error(`扩展链接指向其他位置，未修改：${targetDir}`);
    }
    if (remove) unlinkSync(targetDir);
    return;
  }
  if (remove) return;
  const dist = realpathSync(distDir);
  if (!lstatSync(dist).isDirectory()) throw new Error("dist 必须为目录");
  mkdirSync(path.dirname(targetDir), { recursive: true });
  symlinkSync(dist, targetDir, process.platform === "win32" ? "junction" : "dir");
}
