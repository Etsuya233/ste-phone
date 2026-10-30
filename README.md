# STE-PHONE

面向 SillyTavern 的小手机插件。使用 React、TypeScript、普通 CSS 和 esbuild，提供 iPhone 6s 风格外壳、主屏幕、秒表与 Foundation 组件应用；关闭窗口或退出应用后清空本次应用状态，剧情联动待开发。

## 开始

使用 mise 固定 Node.js 与 pnpm 版本，不依赖 Corepack。

```sh
mise install
pnpm install --frozen-lockfile
pnpm preview:frontend
```

预览默认监听 `0.0.0.0:18826`，本机打开 `http://127.0.0.1:18826/`；同一局域网的设备使用终端输出的本机 IPv4 地址访问，例如 `http://192.168.1.10:18826/`。修改代码后刷新页面。可通过环境变量 `PORT` 改端口，`HOST` 改监听地址；只需本机访问时设置 `HOST=127.0.0.1`。

手机默认保持完整 iPhone 6s 机身比例，桌面和移动端均等比缩放至可用视口。`PhoneApp` 保留可选的全屏响应式模式和拖拽能力，默认关闭，也不显示操作柄。开发预览可通过 `?responsive=1` 开启窄屏全屏模式、`?draggable=1` 开启顶部机身拖拽，两项可组合；生产入口不读取这些参数。

打开手机后，点击主屏的「组件」（Foundation）图标进入组件应用，可操作导航栏、按钮、分组列表、开关、分段控件和页面滚动示例；不连接或保存 ST 数据。开发预览也可用 `/?foundation=1` 快捷进入，可与上述参数组合；普通入口默认进入主屏。

## 开发命令

```sh
pnpm build             # dist/index.js、style.css、manifest.json
pnpm watch             # 增量构建；配置 .env 后自动同步到 ST
pnpm preview:frontend  # 独立预览，共用生产组件与 CSS
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test              # Junction、同步与本地发版集成验证
```

生产入口为 `src/frontend/index.ts`，`host/mount-phone.tsx` 挂载 React 与 Shadow DOM，`phone-app.tsx` 管理窗口开关。`device/` 放机身与会话，`system/` 放状态栏与转场，`foundation/` 放基础视觉组件，`apps/home/`、`apps/stopwatch/`、`apps/foundation/` 分别放主屏、秒表和组件应用，`theme.css` 汇总 CSS 与主题变量。React 随插件打包，无 CDN 依赖。构建产物的 manifest 版本与运行时版本统一读取 `package.json`。

## ST 安装与开发直连

将 `.env.example` 复制为 `.env`，配置 `STE_ST_INSTALL` 或 `STE_ST_EXTENSION_DIR`，两者选一。相对路径以本仓库为基准。`.env` 不进入 Git。

推荐通过 Junction 让 ST 直接读取 `dist/`：

```sh
pnpm build
pnpm st:link
pnpm watch
```

`STE_ST_INSTALL` 自动推导目标目录 `public/scripts/extensions/third-party/ste-phone`。Windows 创建 Junction，其他平台创建目录符号链接。链接指向当前工作区的构建产物；修改后需刷新 ST 页面，入口为右下角“手机”按钮。

```sh
pnpm st:unlink         # 仅解除当前 dist 对应的链接，保留 dist 内容
```

目标若已存在真实目录、指向其他位置的链接或断链，命令报错并保留原内容。Worktree 开发前核对链接指向，避免构建目录与 ST 加载目录不一致。

也可以使用拷贝部署：

```sh
pnpm deploy:st         # 生产构建，再拷贝三个发布文件
pnpm sync              # 单独同步已有构建产物
```

`watch` 没有配置目标时仅构建；配置后在构建成功时同步。目标已直连当前 `dist` 时跳过拷贝。修改 `package.json` 后重启 watch。

## 发版

发布分支为 `release/sillytavern-plugin`，分支根目录仅放插件产物和安装说明。源码在正常开发分支维护，发版命令不会切换当前工作区的分支。

先更新 `package.json` 与源码 `manifest.json` 的版本，执行检查并提交源码，然后运行：

```sh
pnpm release:st --dry-run # 构建验证，允许源码未提交，不修改发布分支
pnpm release:st           # 离线生成或更新本地发布分支并提交
pnpm release:st --push    # 生成并推送 origin 的发布分支
```

发版 worktree 固定在主仓库 `.worktrees/release/sillytavern-plugin/`。命令拒绝未提交的源码、未提交的发布内容，以及发布分支中的非产物文件；推送使用普通 Git push，不强制覆盖远端历史。重复运行相同版本和源提交不会新增提交。

新仓库尚未配置远程地址。需要远程发布时先为本仓库配置 `origin`；用户在 SillyTavern 的扩展安装界面填写该仓库 URL，分支填写 `release/sillytavern-plugin`。后续通过扩展面板的 Update 更新。

## 工作区

- `AGENTS.md`：协作与开发约定；`CLAUDE.md` 指向同一份规则。
- `tmp/`：本地外部参考资源，不进入 Git，已跟踪文件不得依赖其中内容。
- `.scratch/`：按功能组织的需求与本地 Issue，规则见 `docs/agents/issue-tracker.md`。
- `.worktrees/`：此主仓库的 Git Worktree，内容不进入 Git。
- `docs/agents/`：Issue、分诊标签与领域文档约定。
- `docs/ui/`：前端开发及验收约定。

前端开发与验证细节见 [前端开发规范](docs/ui/frontend-development.md) 和 [前端开发与验收](docs/ui/frontend-preview.md)。
