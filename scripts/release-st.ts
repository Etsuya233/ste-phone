import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildExtension,
  DIST_DIR,
  DIST_FILES,
  PACKAGE_ROOT,
  OBSOLETE_DIST_FILES,
  removeObsoleteAssets,
} from "./build-lib.ts";

const branch = "release/sillytavern-plugin";
const args = process.argv.slice(2);
if (args.some((arg) => !["--push", "--dry-run"].includes(arg))) {
  throw new Error("用法：pnpm release:st [--dry-run | --push]");
}
const dryRun = args.includes("--dry-run");
const push = args.includes("--push");
if (dryRun && push) {
  throw new Error("--dry-run 与 --push 不能同时使用");
}

function git(args: string[], cwd = PACKAGE_ROOT): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

const sourceBranch = git(["branch", "--show-current"]);
const sourceCommit = git(["rev-parse", "HEAD"]);
if (sourceBranch === branch) {
  throw new Error("请从源码分支发版");
}
if (!dryRun && git(["status", "--porcelain"])) {
  throw new Error("源码工作区有未提交的改动，请提交后发版；--dry-run 可先验证构建");
}
if (push) {
  git(["remote", "get-url", "origin"]);
}

await buildExtension();
const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")) as {
  version: string;
  stePhone: { minimumMemoryVersion: string };
};
const minimumMemoryVersion = pkg.stePhone.minimumMemoryVersion;
for (const file of DIST_FILES) {
  if (!existsSync(path.join(DIST_DIR, file))) {
    throw new Error(`缺少发布产物：${file}`);
  }
}
if (dryRun) {
  console.info(`[STE Phone] v${pkg.version} 构建通过，未修改发布分支，也未推送`);
} else {
  const commonDir = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const mainRoot = path.dirname(commonDir);
  const worktree = path.join(mainRoot, ".worktrees/release/sillytavern-plugin");
  const stat = lstatSync(worktree, { throwIfNoEntry: false });
  if (stat && (stat.isSymbolicLink() || !existsSync(path.join(worktree, ".git")))) {
    throw new Error(`发布路径已被占用：${worktree}`);
  }
  if (!stat) {
    if (git(["branch", "--list", branch])) {
      git(["worktree", "add", worktree, branch]);
    } else {
      git(["worktree", "add", "--detach", worktree]);
      git(["switch", "--orphan", branch], worktree);
    }
  }
  if (git(["branch", "--show-current"], worktree) !== branch) {
    throw new Error("发布 worktree 不在预期分支");
  }
  if (git(["status", "--porcelain"], worktree)) {
    throw new Error("发布 worktree 有未提交内容，未修改");
  }
  const allowed = new Set<string>([...DIST_FILES, ...OBSOLETE_DIST_FILES, "README.md"]);
  for (const file of git(["ls-files"], worktree).split("\n").filter(Boolean)) {
    if (!allowed.has(file)) {
      throw new Error(`发布分支有非产物文件，未修改：${file}`);
    }
  }

  removeObsoleteAssets(worktree);
  for (const file of DIST_FILES) {
    copyFileSync(path.join(DIST_DIR, file), path.join(worktree, file));
  }
  writeFileSync(
    path.join(worktree, "README.md"),
    `# STE Phone — SillyTavern 插件发布分支\n\n此分支由源码构建生成，源码与问题反馈：https://github.com/Etsuya233/ste-phone\n\n## 安装与运行要求\n\n当前版本：${pkg.version}。资料与数据库功能需要 **STE Memory >= ${minimumMemoryVersion}**（提供 STE_MEMORY_API.database v1）。请先升级 Memory，再刷新 ST。\n\n在 ST「扩展 → 安装扩展」中填写：\n\n| 插件 | 仓库 URL | Branch or tag name |\n| --- | --- | --- |\n| STE Memory >= ${minimumMemoryVersion} | https://github.com/Etsuya233/ste-memory | ${branch} |\n| STE Phone | https://github.com/Etsuya233/ste-phone | ${branch} |\n\n安装后刷新页面，从聊天输入区的**魔法棒菜单 → 小手机**打开。更新时使用扩展面板的 Update。未连接 Memory 时手机外壳、秒表与组件应用仍可使用。\n\n源提交：${sourceCommit}（${sourceBranch || "detached HEAD"}）\n`,
  );
  git(["add", "-A", "--", "."], worktree);
  if (git(["diff", "--cached", "--name-only"], worktree)) {
    git(["commit", "-m", `release v${pkg.version} (${sourceCommit.slice(0, 7)})`], worktree);
  }
  if (push) {
    git(["push", "origin", branch]);
  }
  console.info(`[STE Phone] v${pkg.version} → ${branch}${push ? "，已推送" : "，仅本地提交"}`);
}
