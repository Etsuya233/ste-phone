import { encodeBase64 } from "../../../infrastructure/browser/base64.ts";
import type { WebsiteSource } from "../browser.ts";

export function websiteDocument(source: WebsiteSource): string {
  const doc = new DOMParser().parseFromString(source.html, "text/html");
  if (!doc.head.querySelector('meta[name="viewport"]')) {
    const viewport = doc.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1";
    doc.head.prepend(viewport);
  }
  // 以 UTF-8 资源载入源码，避免 CSS/JS 中的闭合标签改变 HTML 结构。
  const encoder = new TextEncoder();
  const style = doc.createElement("link");
  style.rel = "stylesheet";
  style.href = `data:text/css;charset=utf-8;base64,${encodeBase64(encoder.encode(source.css))}`;
  doc.head.append(style);
  const script = doc.createElement("script");
  script.src = `data:text/javascript;charset=utf-8;base64,${encodeBase64(encoder.encode(source.js))}`;
  doc.body.append(script);
  const doctype = doc.doctype
    ? new XMLSerializer().serializeToString(doc.doctype)
    : "<!doctype html>";
  return doctype + doc.documentElement.outerHTML;
}
