import { createRoot } from "react-dom/client";
import type { ComponentProps } from "react";
import { PhoneApp } from "../phone-app.tsx";

export function mountPhone(options: ComponentProps<typeof PhoneApp>): void {
  if (document.getElementById("ste-phone-host")) {
    throw new Error("STE Phone 已挂载，请刷新页面加载新版本");
  }
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
