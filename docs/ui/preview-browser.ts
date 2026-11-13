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

export function previewWebsiteReply(prompt: string, mode: string | null): string {
  if (mode === "invalid") {
    return "模拟非法 JSON";
  }
  const input = JSON.parse(prompt) as { title: string; source: typeof source; instruction: string };
  if (input.source.html || input.source.css || input.source.js) {
    return JSON.stringify({
      ...input.source,
      title: input.title,
      reply: "已在当前源码基础上更新页面标题栏，保留原有 CSS 和 JavaScript。",
      html: input.source.html.replace("</body>", "") + "<footer>模拟更新完成</footer>",
    });
  }
  return JSON.stringify({ ...source, title, reply: `已完成「${input.instruction}」的模拟网页。` });
}
