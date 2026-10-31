import path from "node:path";

/** Keep data ownership visible at static import sites, including type-only imports. */
export const appBoundaries = {
  meta: { type: "problem", schema: [], messages: { boundary: "{{detail}}" } },
  create(context) {
    const root = path.resolve(import.meta.dirname, "..", "src");
    const file = context.filename;
    const source = path.relative(root, file).replaceAll("\\", "/");
    if (source.endsWith(".test.ts")) return {};
    function check(node, specifier) {
      if (typeof specifier !== "string") return;
      const target = specifier.startsWith(".")
        ? path.relative(root, path.resolve(path.dirname(file), specifier)).replaceAll("\\", "/")
        : specifier;
      const app = /^apps\/([^/]+)\//.exec(source)?.[1];
      const otherApp = /^apps\/([^/]+)\//.exec(target)?.[1];
      let detail;
      if (source.startsWith("core/") && /^(apps|frontend|infrastructure)\//.test(target))
        detail = "Core 只能依赖底层契约，不依赖 App、界面或宿主实现。";
      else if (
        app &&
        !source.startsWith(`apps/${app}/ui/`) &&
        /^(frontend\/|infrastructure\/|react(?:$|\/)|react-dom(?:$|\/))/.test(target)
      )
        detail = "App 业务代码不依赖界面或宿主实现，具体依赖由入口注入。";
      else if (app && otherApp && app !== otherApp && target !== `apps/${otherApp}/public.ts`)
        detail = "跨 App 依赖必须通过数据所有者的 public.ts。";
      else if (
        source.startsWith("frontend/") &&
        otherApp &&
        target !== `apps/${otherApp}/public.ts`
      )
        detail = "外壳只消费 App 公开契约；具体 App 页面由 bootstrap 组装。";
      if (detail) context.report({ node, messageId: "boundary", data: { detail } });
    }
    return {
      ImportDeclaration: (node) => check(node, node.source.value),
      ExportNamedDeclaration: (node) => {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration: (node) => check(node, node.source.value),
      ImportExpression: (node) => check(node, node.source.value),
    };
  },
};
