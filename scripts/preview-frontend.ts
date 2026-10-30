import { context } from "esbuild";
import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { createBuildOptions, PACKAGE_ROOT } from "./build-lib.ts";

const outdir = path.join(PACKAGE_ROOT, "node_modules/.cache/frontend-preview");
mkdirSync(outdir, { recursive: true });
writeFileSync(
  path.join(outdir, "index.html"),
  '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>STE Phone 预览</title><body><script type="module" src="./index.js"></script></body></html>\n',
);
const ctx = await context({
  ...createBuildOptions(true),
  entryPoints: { index: "docs/ui/frontend-preview.tsx", style: "src/frontend/theme.css" },
  outdir,
});
await ctx.watch();
const server = await ctx.serve({
  host: "127.0.0.1",
  port: Number(process.env.PORT ?? 18826),
  servedir: outdir,
});
console.info(`[STE Phone] http://127.0.0.1:${server.port}/，修改后刷新页面`);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void ctx.dispose();
  });
}
