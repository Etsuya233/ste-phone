import { validateMap, type MapDocument } from "../../../src/apps/map/map.ts";
import type { ComparisonRenderer } from "./renderer.ts";

const engine = new URL(location.href).searchParams.get("engine") ?? "leaflet";
if (engine !== "leaflet" && engine !== "openlayers") {
  throw new Error("未知地图引擎");
}
const mapDocument: MapDocument = await (await fetch("./map.json")).json();
validateMap(mapDocument);
document.querySelector("#app")!.innerHTML = `
  <header><span class="eyebrow">STE PHONE / RENDERER STUDY</span>
    <h1>同一张地图，两种绘制方式</h1>
    <p class="intro">保留现有 Leaflet 优化版作为基线，检查 OpenLayers 自带标签避让的效果。每次只加载一种引擎，地图数据来自本地副本。</p>
    <nav class="engines"><a href="?engine=leaflet">Leaflet · 当前实现</a><a href="?engine=openlayers">OpenLayers · Canvas + 自动避让</a></nav>
  </header>
  <div class="layout"><section>
    <div class="toolbar"><button id="fit">全图</button><button id="zoom-in">放大</button><button id="zoom-out">缩小</button><button id="height">切换高度</button><button id="recreate">卸载重建</button></div>
    <div class="stage"><div id="map-host"></div></div>
    <p id="map-name" class="note"></p>
  </section><aside>
    <section class="card"><h2>固定序列测试</h2><p class="note">每项十轮，动作间隔 350ms。测试前恢复全图。主线程与布局耗时另通过浏览器性能接口采集。</p>
      <div class="toolbar"><button data-test="zoom">缩放往返</button><button data-test="pan">平移往返</button><button data-test="resize">高度往返</button></div>
      <p id="status">加载中</p><pre id="stats"></pre><pre id="result"></pre>
    </section>
    <section class="card"><h2>比较边界</h2><p class="note">这页不加载 ST 聊天、手机外壳或 AI。两侧使用同一批语义要素和装饰几何；OpenLayers 的文字位置、避让与部分纹理呈现会不同。JS 堆数据不含 GPU、Canvas 或整个页面进程内存；桌面结果不能替代 iPhone 真机。</p></section>
  </aside></div>`;
document.querySelector(`a[href="?engine=${engine}"]`)!.setAttribute("aria-current", "page");
document.querySelector("#map-name")!.textContent =
  `${mapDocument.title} · v${mapDocument.revision} · ${mapDocument.features.length} 个要素`;
const host = document.querySelector<HTMLDivElement>("#map-host")!;
const shadow = host.attachShadow({ mode: "open" });
const style = document.createElement("style");
style.textContent = await (await fetch(engine === "leaflet" ? "./leaflet.css" : "./ol.css")).text();
style.textContent += `:host{--ios-font:system-ui,sans-serif;--ios-row-surface:#fff;--ios-blue:#007aff;--ios-line:#ddd;--ios-disabled-opacity:.4} .map-canvas{position:relative;width:100%;height:100%;background:#eeeae0;overflow:hidden;font-family:system-ui,sans-serif} .ol-viewport{touch-action:none}`;
const container = document.createElement("div");
container.className = "map-canvas";
shadow.append(style, container);
const createRenderer =
  engine === "leaflet"
    ? (await import("./leaflet-renderer.ts")).createLeafletRenderer
    : (await import("./openlayers-renderer.ts")).createOpenLayersRenderer;
let renderer: ComparisonRenderer = createRenderer(container, mapDocument);
const resizeObserver = new ResizeObserver(() => renderer.resize());
resizeObserver.observe(host);
const showStats = () => {
  requestAnimationFrame(() => {
    document.querySelector("#stats")!.textContent = JSON.stringify(
      { engine, ...renderer.stats() },
      null,
      2,
    );
  });
};
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function run(scenario: "zoom" | "pan" | "resize") {
  document
    .querySelectorAll<HTMLButtonElement>("button")
    .forEach((button) => (button.disabled = true));
  document.querySelector("#status")!.textContent = `正在测试 ${scenario}…`;
  host.style.height = "520px";
  renderer.resize();
  renderer.fit();
  await wait(500);
  const longTasks: number[] = [];
  const observer = new PerformanceObserver((list) =>
    longTasks.push(...list.getEntries().map((entry) => entry.duration)),
  );
  observer.observe({ type: "longtask" });
  const start = performance.now();
  try {
    for (let i = 0; i < 10; i++) {
      if (scenario === "zoom") {
        renderer.zoomBy(0.5);
      }
      if (scenario === "pan") {
        renderer.panBy(50, 30);
      }
      if (scenario === "resize") {
        host.style.height = "260px";
        renderer.resize();
      }
      await wait(350);
      if (scenario === "zoom") {
        renderer.zoomBy(-0.5);
      }
      if (scenario === "pan") {
        renderer.panBy(-50, -30);
      }
      if (scenario === "resize") {
        host.style.height = "520px";
        renderer.resize();
      }
      await wait(350);
    }
  } finally {
    observer.disconnect();
    document
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((button) => (button.disabled = false));
  }
  const result = {
    engine,
    scenario,
    elapsedMs: performance.now() - start,
    longTasks,
    stats: renderer.stats(),
  };
  document.querySelector("#result")!.textContent = JSON.stringify(result, null, 2);
  document.querySelector("#status")!.textContent = "测试完成";
  showStats();
  return result;
}

document.querySelector("#fit")!.addEventListener("click", () => {
  renderer.fit();
  showStats();
});
document.querySelector("#zoom-in")!.addEventListener("click", () => {
  renderer.zoomBy(0.5);
  showStats();
});
document.querySelector("#zoom-out")!.addEventListener("click", () => {
  renderer.zoomBy(-0.5);
  showStats();
});
document.querySelector("#height")!.addEventListener("click", () => {
  host.style.height = host.style.height === "260px" ? "520px" : "260px";
  renderer.resize();
  showStats();
});
document.querySelector("#recreate")!.addEventListener("click", () => {
  renderer.destroy();
  renderer = createRenderer(container, mapDocument);
  showStats();
});
document.querySelectorAll<HTMLButtonElement>("[data-test]").forEach((button) => {
  button.addEventListener(
    "click",
    () => void run(button.dataset.test as "zoom" | "pan" | "resize"),
  );
});
window.addEventListener(
  "pagehide",
  () => {
    resizeObserver.disconnect();
    renderer.destroy();
  },
  { once: true },
);
// Explicit developer-only surface for repeatable browser performance measurements.
Object.assign(window, { mapComparison: { engine, run, stats: () => renderer.stats() } });
document.querySelector("#status")!.textContent = "准备就绪";
showStats();
