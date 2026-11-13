import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type Static, type TSchema } from "typebox";
import type { WebsiteWork } from "./browser.ts";

const files = { "index.html": "html", "style.css": "css", "script.js": "js" } as const;
const path = Type.Union([
  Type.Literal("index.html"),
  Type.Literal("style.css"),
  Type.Literal("script.js"),
]);
const line = Type.Optional(Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }));

export function websiteWorkspace(work: WebsiteWork, signal: AbortSignal) {
  const source = { ...work.source };
  let title = work.title;
  function tool<S extends TSchema>(
    name: string,
    label: string,
    description: string,
    parameters: S,
    apply: (args: Static<S>) => string,
  ): AgentTool<S> {
    return {
      name,
      label,
      description,
      parameters,
      async execute(_id, args) {
        signal.throwIfAborted();
        return { content: [{ type: "text", text: apply(args) }], details: {} };
      },
    };
  }

  const read = tool(
    "read_file",
    "读取文件",
    "读取指定文件。start_line 和 end_line 为可选的从 1 开始的闭区间；均省略时读取全文。",
    Type.Object({ path, start_line: line, end_line: line }, { additionalProperties: false }),
    ({ path, start_line, end_line }) => {
      const content = source[files[path]];
      if (start_line === undefined && end_line === undefined) {
        return content;
      }
      const breaks = [...content.matchAll(/\r\n|\n|\r/g)];
      const lineCount = breaks.length + 1;
      const start = start_line ?? 1;
      const end = end_line ?? lineCount;
      if (start > end || end > lineCount) {
        throw new Error(`行范围必须在 1–${lineCount} 内，且起始行不能超过结束行。`);
      }
      const previousBreak = breaks[start - 2];
      const from = previousBreak ? previousBreak.index + previousBreak[0].length : 0;
      return content.slice(from, breaks[end - 1]?.index ?? content.length);
    },
  );
  const write = tool(
    "write_file",
    "写入文件",
    "完整替换指定文件。可选 title 用于为新作品命名或修改作品标题。",
    Type.Object(
      { path, content: Type.String(), title: Type.Optional(Type.String()) },
      { additionalProperties: false },
    ),
    (args) => {
      const nextTitle = args.title?.trim();
      if (args.title !== undefined && !nextTitle) {
        throw new Error("作品标题不能为空。");
      }
      source[files[args.path]] = args.content;
      if (nextTitle !== undefined) {
        title = nextTitle;
      }
      return `已写入 ${args.path}。`;
    },
  );
  const edit = tool(
    "edit_file",
    "修改文件",
    "用 new_text 替换文件中唯一一处精确匹配的 old_text。空格和换行也必须一致。",
    Type.Object(
      { path, old_text: Type.String({ minLength: 1 }), new_text: Type.String() },
      { additionalProperties: false },
    ),
    ({ path, old_text, new_text }) => {
      const key = files[path];
      const content = source[key];
      const index = content.indexOf(old_text);
      if (index < 0) {
        throw new Error(`${path} 中未找到 old_text，请读取并核对当前内容。`);
      }
      if (content.indexOf(old_text, index + 1) >= 0) {
        throw new Error(`${path} 中存在多处匹配，请在 old_text 中包含更多上下文。`);
      }
      source[key] = content.slice(0, index) + new_text + content.slice(index + old_text.length);
      return `已修改 ${path}。`;
    },
  );
  return { tools: [read, write, edit], result: () => ({ title, source }) };
}
