import { build, context } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PACKAGE_ROOT } from "./build-lib.ts";

// The map is an explicit local fixture. It is never bundled into tracked source or sent to a service.
const fixture = process.argv[2];
if (!fixture) {
  throw new Error("用法：pnpm preview:map-comparison <本地 MapDocument JSON 路径>");
}
const outdir = path.join(PACKAGE_ROOT, "node_modules/.cache/map-renderer-comparison");
mkdirSync(outdir, { recursive: true });
JSON.parse(readFileSync(fixture, "utf8"));
copyFileSync(fixture, path.join(outdir, "map.json"));
copyFileSync(path.join(PACKAGE_ROOT, "node_modules/ol/ol.css"), path.join(outdir, "ol.css"));
copyFileSync(
  path.join(PACKAGE_ROOT, "src/apps/map/ui/map-leaflet.css"),
  path.join(outdir, "leaflet.css"),
);
writeFileSync(
  path.join(outdir, "index.html"),
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>地图引擎对照</title><link rel="stylesheet" href="./comparison-style.css"><body><main id="app"></main><script type="module" src="./comparison.js"></script></body></html>',
  "utf8",
);
const options = {
  absWorkingDir: PACKAGE_ROOT,
  entryPoints: {
    comparison: "docs/ui/map-renderer-comparison/comparison.ts",
    "comparison-style": "docs/ui/map-renderer-comparison/comparison.css",
  },
  outdir,
  bundle: true,
  splitting: true,
  format: "esm" as const,
  platform: "browser" as const,
  target: "es2022",
  minify: true,
  metafile: true,
  logLevel: "info" as const,
};
const built = await build(options);
writeFileSync(
  path.join(outdir, "build-meta.json"),
  JSON.stringify(built.metafile, null, 2),
  "utf8",
);
const ctx = await context(options);
await ctx.watch();
const server = await ctx.serve({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 18829),
  servedir: outdir,
});
console.info(`地图引擎对照：http://127.0.0.1:${server.port}/?engine=leaflet`);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void ctx.dispose());
}
