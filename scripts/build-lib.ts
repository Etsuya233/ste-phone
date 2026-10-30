import { build, type BuildOptions } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DIST_DIR = path.join(PACKAGE_ROOT, "dist");
export const DIST_FILES = [
  "index.js",
  "style.css",
  "manifest.json",
  "database-worker.js",
  "sqlite3.wasm",
] as const;

export function createBuildOptions(dev: boolean): BuildOptions {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")) as {
    version: string;
  };
  return {
    absWorkingDir: PACKAGE_ROOT,
    entryPoints: {
      index: "src/frontend/index.ts",
      style: "src/frontend/theme.css",
      "database-worker": "src/infrastructure/sqlite/database-worker.ts",
    },
    outdir: DIST_DIR,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    minify: !dev,
    sourcemap: dev,
    logLevel: "info",
    define: {
      __STE_PHONE_VERSION__: JSON.stringify(pkg.version),
      "process.env.NODE_ENV": JSON.stringify(dev ? "development" : "production"),
    },
  };
}

export function copyDatabaseAssets(outdir = DIST_DIR): void {
  mkdirSync(outdir, { recursive: true });
  copyFileSync(
    path.join(PACKAGE_ROOT, "node_modules/@sqlite.org/sqlite-wasm/dist/sqlite3.wasm"),
    path.join(outdir, "sqlite3.wasm"),
  );
}

export function writeManifest(): void {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")) as {
    version: string;
  };
  const manifest = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "manifest.json"), "utf8"));
  mkdirSync(DIST_DIR, { recursive: true });
  writeFileSync(
    path.join(DIST_DIR, "manifest.json"),
    `${JSON.stringify({ ...manifest, version: pkg.version }, null, 2)}\n`,
  );
}

export async function buildExtension(): Promise<void> {
  await build(createBuildOptions(false));
  writeManifest();
  copyDatabaseAssets();
  for (const file of ["index.js.map", "style.css.map", "database-worker.js.map"]) {
    rmSync(path.join(DIST_DIR, file), { force: true });
  }
}
