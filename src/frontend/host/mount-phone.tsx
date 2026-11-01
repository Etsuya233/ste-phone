import { createRoot } from "react-dom/client";
import type { ComponentProps } from "react";
import { PhoneApp } from "../phone-app.tsx";

export function mountPhone(options: ComponentProps<typeof PhoneApp>): void {
  if (document.getElementById("ste-phone-host")) {
    throw new Error("STE Phone 已挂载，请刷新页面加载新版本");
  }
  // 字体声明放在文档级，供 Shadow DOM 使用。Inter 供手机外壳使用，Noto Serif SC 供日记界面使用；
  // 字体文件不进入产物，网络不可用时由各字体栈的本机字体接管。
  const fonts = document.createElement("link");
  fonts.rel = "stylesheet";
  fonts.href =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Serif+SC:wght@400;600&display=swap";
  document.head.append(fonts);
  // 日记正文使用手写体；LXGW WenKai 的字体文件按页面用字分片下载，未加载时回退到楷体或衬线体。
  const handwriting = document.createElement("link");
  handwriting.rel = "stylesheet";
  handwriting.href =
    "https://cdn.jsdelivr.net/npm/lxgw-wenkai-webfont@1.7.0/lxgwwenkai-regular.css";
  document.head.append(handwriting);
  const host = document.createElement("div");
  host.id = "ste-phone-host";
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  const stylesheet = document.createElement("link");
  stylesheet.rel = "stylesheet";
  // 生产和预览均把 style.css 放在入口 bundle 旁边。
  stylesheet.href = new URL("./style.css", import.meta.url).href;
  const container = document.createElement("div");
  shadow.append(stylesheet, container);
  createRoot(container).render(<PhoneApp {...options} />);
}
