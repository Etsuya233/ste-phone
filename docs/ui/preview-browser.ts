import type { Message, ToolCall } from "@earendil-works/pi-ai";
import {
  emptyBrowserData,
  readBrowserData,
  type BrowserData,
  type BrowserStorage,
} from "../../src/apps/browser/browser.ts";

export function createPreviewBrowserStorage(mode: string | null): BrowserStorage {
  const key = (chatId: string) => `ste-phone-preview-browser-v1:${chatId}`;
  let firstWrite = true;
  return {
    read(chatId) {
      const value = localStorage.getItem(key(chatId));
      return value ? readBrowserData(JSON.parse(value)) : mode === "demo" ? demo : null;
    },
    async write(chatId, data) {
      if (mode === "slow-save") {
        await new Promise((resolve) => setTimeout(resolve, 4_000));
      }
      if (mode === "save-error" && firstWrite) {
        firstWrite = false;
        throw new Error("模拟保存失败，请重试");
      }
      localStorage.setItem(key(chatId), JSON.stringify(data));
    },
  };
}

const title = "窗边植物观察";
const source = {
  html: "<main><h1>窗边植物观察</h1><p>每浇一次水，按一下叶子。</p><button>🍃 浇水</button><output>0</output></main>",
  css: "body{margin:0;background:#e5efdc;color:#18372a;font:16px system-ui}main{padding:32px 20px}button{padding:12px;background:#fff;border:0;border-radius:12px}output{margin-left:12px}",
  js: 'let count=0;document.querySelector("button").onclick=()=>{document.querySelector("output").textContent=++count}',
};
const demo: BrowserData = {
  ...emptyBrowserData,
  works: [
    {
      id: "preview-work",
      author: { sourceId: "ste-memory", scopeId: "preview-space", id: "red", name: "小红" },
      title,
      source,
      turns: [
        {
          instruction: "做一个记录浇水次数的小网页。",
          reply: "做了一个可以点击记录浇水的植物观察页。",
        },
      ],
      versions: [{ savedAt: "2026-11-13T00:00:00.000Z", title, source }],
    },
  ],
};

export function previewWebsiteReply(
  messages: readonly Message[],
  mode: string | null,
): string | ToolCall {
  if (mode === "invalid") {
    return "";
  }
  const results = messages.filter((message) => message.role === "toolResult");
  const call = (name: string, args: Record<string, unknown>): ToolCall => ({
    type: "toolCall",
    id: `preview-browser-${results.length}`,
    name,
    arguments: args,
  });
  if (!results.length) {
    return call("read_file", { path: "index.html" });
  }
  const html = results[0]!.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("");
  if (html) {
    if (results.length === 1) {
      return call("edit_file", {
        path: "index.html",
        old_text: "<!-- preview-update -->",
        new_text: "<footer>模拟更新完成</footer>",
      });
    }
    if (results.length === 2 && results[1]!.isError) {
      const withFooter = html.replace(/<\/body>/i, "<footer>模拟更新完成</footer></body>");
      return call("write_file", {
        path: "index.html",
        content: withFooter === html ? html + "<footer>模拟更新完成</footer>" : withFooter,
      });
    }
    return "已基于当前 HTML 更新页面，保留 CSS 和 JavaScript。";
  }
  switch (results.length) {
    case 1:
      return call("write_file", { path: "index.html", content: source.html, title });
    case 2:
      return call("write_file", { path: "style.css", content: source.css });
    case 3:
      return call("write_file", { path: "script.js", content: source.js });
    default:
      return "已完成模拟网页，可以点击页面记录浇水次数。";
  }
}
