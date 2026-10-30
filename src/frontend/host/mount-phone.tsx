import { createRoot } from "react-dom/client";
import type { ComponentProps } from "react";
import { PhoneApp } from "../phone-app.tsx";

export function mountPhone(options: ComponentProps<typeof PhoneApp>): void {
  if (document.getElementById("ste-phone-host")) {
    throw new Error("STE Phone 已挂载，请刷新页面加载新版本");
  }
  // 字体声明放在文档级，供 Shadow DOM 使用；Apple 字体可用时无需下载 Inter 字形。
  const fonts = document.createElement("link");
  fonts.rel = "stylesheet";
  fonts.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
  document.head.append(fonts);
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
