# 前端开发与验收

运行 `pnpm preview:frontend`，打开 `http://127.0.0.1:18826/`，点击右下角“手机”按钮。桌面显示居中的手机窗口，480px 以下使用全屏。关闭按钮与 Escape 均应关闭窗口；关闭后可重新打开，焦点回到入口。修改代码后刷新页面。

预览使用 esbuild 的监听与静态服务，产物放在 `node_modules/.cache/frontend-preview/`，不连接 ST、不读 API 配置、不写入真实对话。

执行 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm test` 和 `pnpm build` 验证工程。`pnpm test` 使用隔离临时仓库检查 Junction 的创建、解除和错误目标保护，以及同步和离线发布。

真实 ST 接入：配置 `.env` 后运行 `pnpm build`、`pnpm st:link`，刷新 ST 页面，验证入口、窗口开关、样式隔离与窄屏布局。开发监听用 `pnpm watch`。解除直连用 `pnpm st:unlink`。具体命令与发版流程以 README 为准。

独立预览使用隔离的测试数据，避免向用户真实对话写入。独立预览通过后，ST 入口、宿主样式、聊天切换和持久化仍需在专用测试对话中验证。

验收报告注明实际执行的检查、结果与未验证范围。截图、日志和本地报告放在忽略目录；已跟踪文件不得引用 tmp 中的资源。

## 工程接入验证（2026-10-30）

类型检查、Lint、格式检查、生产构建及 5 项工程测试通过；watch 首次构建、manifest 修改重建与 Junction 跳过拷贝通过。本仓库发布 dry-run 通过，真实发布提交在隔离临时仓库验证，没有推送远端。

Edge 无头浏览器验证了桌面窗口尺寸、打开关闭、Escape、焦点恢复、320px 与 390px 窄屏，以及 Shadow DOM 和全局加载 CSS 的双向隔离。真实 ST `http://127.0.0.1:8000/` 自动发现并加载插件，入口与窗口开关通过；未执行聊天或模型请求。
