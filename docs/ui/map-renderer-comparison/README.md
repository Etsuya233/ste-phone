# 地图引擎对照原型

启动：`pnpm preview:map-comparison <本地 MapDocument JSON 路径>`。服务默认只监听 `127.0.0.1:18829`，数据复制到忽略的 `node_modules/.cache`，不修改 ST 的地图或模型连接。测试夹具可放在忽略的 `tmp`，不要提交聊天数据。

`?engine=leaflet` 使用生产优化版 MapDrawing；`?engine=openlayers` 使用 OpenLayers Canvas 图层及标签避让。每次导航只加载所选引擎。页面提供缩放、平移、容器高度往返及卸载重建，固定序列由 `comparison.ts` 中的 `run` 维护，浏览器测试接口为 `window.mapComparison`。

绘制、标签优先级和坐标适配在 `openlayers-renderer.ts`，道路样式在 `openlayers-roads.ts`。OpenLayers 没有复刻生产的全部纹理、标签门槛、控件避让、选中与提案效果，页面也不加载 ST、手机外壳或 AI。它用于比较渲染方案，不能替代生产功能或 iPhone 内存验收。OpenLayers 适配器的工厂函数保留图层创建、视图和销毁闭包集中组织，超过普通函数审查阈值；文件仍低于 350 行，样式规则按职责独立组织。

2026-11-06 的三轮桌面测试、完整数据和限制见 [对照报告](../../performance/2026-11-06-map-engine-comparison.html)。生产构建的 JS 哈希保持不变；当前原型未接入生产入口。
