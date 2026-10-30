import { context } from "esbuild";
import path from "node:path";
import { networkInterfaces } from "node:os";
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
const host = process.env.HOST ?? "0.0.0.0";
const server = await ctx.serve({
  host,
  port: Number(process.env.PORT ?? 18826),
  servedir: outdir,
});
const addresses =
  host === "0.0.0.0"
    ? [
        "127.0.0.1",
        ...Object.values(networkInterfaces()).flatMap((entries) =>
          entries!
            .filter((entry) => entry.family === "IPv4" && !entry.internal)
            .map((entry) => entry.address),
        ),
      ]
    : [host];
for (const address of new Set(addresses)) {
  console.info(
    `[STE Phone] http://${address.includes(":") ? `[${address}]` : address}:${server.port}/，修改后刷新页面`,
  );
}
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    void ctx.dispose();
  });
}
