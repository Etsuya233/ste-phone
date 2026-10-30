import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { DIST_FILES, OBSOLETE_DIST_FILES, PACKAGE_ROOT } from "./build-lib.ts";
import { linkExtension } from "./extension-link.ts";
import { resolveExtensionTarget, syncExtension } from "./extension-target.ts";

function workspace(t: TestContext): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "ste-phone-tooling-"));
  t.after(() => {
    assert.equal(path.dirname(root), realpathSync(os.tmpdir()));
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

test("Junction 可重复创建，解除后构建产物仍存在", (t) => {
  const root = workspace(t);
  const dist = path.join(root, "dist");
  const target = path.join(root, "extensions/ste-phone");
  mkdirSync(dist);
  writeFileSync(path.join(dist, "index.js"), "retained");
  linkExtension(dist, target, false);
  linkExtension(dist, target, false);
  assert.ok(lstatSync(target).isSymbolicLink());
  assert.equal(realpathSync(target), realpathSync(dist));
  linkExtension(dist, target, true);
  assert.equal(existsSync(target), false);
  assert.equal(readFileSync(path.join(dist, "index.js"), "utf8"), "retained");
});

test("建链与解链拒绝真实目录、外部链接和断链", (t) => {
  const root = workspace(t);
  const dist = path.join(root, "dist");
  const target = path.join(root, "target");
  const other = path.join(root, "other");
  mkdirSync(dist);
  mkdirSync(target);
  writeFileSync(path.join(target, "user-data"), "retained");
  for (const remove of [false, true]) assert.throws(() => linkExtension(dist, target, remove));
  assert.equal(readFileSync(path.join(target, "user-data"), "utf8"), "retained");
  mkdirSync(other);
  const link = path.join(root, "foreign-link");
  symlinkSync(other, link, process.platform === "win32" ? "junction" : "dir");
  for (const remove of [false, true]) assert.throws(() => linkExtension(dist, link, remove));
  rmdirSync(other);
  assert.throws(() => linkExtension(dist, link, false));
  assert.ok(lstatSync(link).isSymbolicLink());
});

test("同步只复制发布产物，识别直连并拒绝错误目标", (t) => {
  const root = workspace(t);
  const dist = path.join(root, "dist");
  const target = path.join(root, "target");
  mkdirSync(dist);
  for (const file of DIST_FILES) writeFileSync(path.join(dist, file), file);
  writeFileSync(path.join(dist, "index.js.map"), "dev-only");
  mkdirSync(target);
  for (const file of OBSOLETE_DIST_FILES) writeFileSync(path.join(target, file), "old-managed");
  writeFileSync(path.join(target, "user-data"), "retained");
  syncExtension(dist, target);
  for (const file of OBSOLETE_DIST_FILES) assert.equal(existsSync(path.join(target, file)), false);
  assert.equal(readFileSync(path.join(target, "user-data"), "utf8"), "retained");
  assert.equal(existsSync(path.join(target, "index.js.map")), false);
  for (const file of DIST_FILES) assert.equal(readFileSync(path.join(target, file), "utf8"), file);
  const link = path.join(root, "linked");
  linkExtension(dist, link, false);
  syncExtension(dist, link);
  assert.throws(() => syncExtension(dist, dist));
  assert.throws(() => syncExtension(dist, path.join(dist, "nested")));
  assert.throws(() => syncExtension(dist, root));
  const other = path.join(root, "foreign-link");
  symlinkSync(target, other, process.platform === "win32" ? "junction" : "dir");
  assert.throws(() => syncExtension(dist, other));
});

test("ST 目标配置缺省可仅构建，冲突配置立即报错", () => {
  assert.equal(resolveExtensionTarget({}), undefined);
  assert.equal(
    resolveExtensionTarget({ STE_ST_INSTALL: "local-st" }),
    path.join(PACKAGE_ROOT, "local-st/public/scripts/extensions/third-party/ste-phone"),
  );
  assert.throws(() =>
    resolveExtensionTarget({ STE_ST_INSTALL: "st", STE_ST_EXTENSION_DIR: "extension" }),
  );
});

test("发布支持离线、只含产物、重复执行且保留未提交内容", async (t) => {
  const root = workspace(t);
  for (const name of [
    "src",
    "scripts",
    "package.json",
    "manifest.json",
    "tsconfig.json",
    ".gitignore",
  ]) {
    cpSync(path.join(PACKAGE_ROOT, name), path.join(root, name), { recursive: true });
  }
  symlinkSync(
    path.join(PACKAGE_ROOT, "node_modules"),
    path.join(root, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const git = (args: string[], cwd = root) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  const release = (args: string[] = []) =>
    execFileSync(process.execPath, ["scripts/release-st.ts", ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    });
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Tooling Test"]);
  git(["config", "user.email", "tooling@example.invalid"]);
  git(["add", "."]);
  git(["commit", "-m", "fixture"]);
  const source = git(["rev-parse", "HEAD"]);
  release(["--dry-run"]);
  assert.equal(git(["branch", "--list", "release/sillytavern-plugin"]), "");
  release();
  const worktree = path.join(root, ".worktrees/release/sillytavern-plugin");
  assert.deepEqual(
    git(["ls-files"], worktree).split("\n").sort(),
    [...DIST_FILES, "README.md"].sort(),
  );
  const firstRelease = git(["rev-parse", "HEAD"], worktree);
  assert.equal(git(["rev-parse", "HEAD"]), source);
  const manifest = JSON.parse(readFileSync(path.join(worktree, "manifest.json"), "utf8"));
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(manifest.version, pkg.version);
  assert.ok(
    readFileSync(path.join(worktree, "README.md"), "utf8").includes(
      `STE Memory >= ${pkg.stePhone.minimumMemoryVersion}`,
    ),
  );
  release();
  assert.equal(git(["rev-parse", "HEAD"], worktree), firstRelease);
  writeFileSync(path.join(worktree, "README.md"), "user edit");
  assert.throws(() => release());
  assert.equal(readFileSync(path.join(worktree, "README.md"), "utf8"), "user edit");
});
