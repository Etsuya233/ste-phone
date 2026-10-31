# STE-PHONE

面向 SillyTavern 的小手机插件。使用 React、TypeScript、普通 CSS 和 esbuild，提供 iPhone 6s 风格外壳、主屏幕、秒表、Foundation 组件、只读资料应用、Fake DBeaver 数据库应用和壁纸设置。公共数据源连接 STE Memory，将 Phone 定义的标准视图注册到 Memory 已提交数据库，供当前人物、纪要、物品和世界状态查询。

「日记」支持选择 Memory 人物，以第一人称结合世界状态、最近 5 条关联且已结束的纪要和最近 20 条清洗后的聊天生成日记。最近聊天需要同轮更新的 STE Memory 提供 `STE_MEMORY_API.chat v1`，缺少能力时明确报错；Phone 不直接读取 ST 原文。使用 Phone 默认模型连接，生成设置默认总超时 300 秒、输出上限 10240 token，篇幅由模型自然发挥。完整生成后自动保存，可回看、复制、删除或再写一篇。作者选择、生成设置和日记按聊天保存在聊天元数据中，已保存内容可在 Memory 或模型不可用时阅读。

生成中 Home 和关闭手机继续运行，Expose 明确退出或切换聊天取消；资料普通更新不重算本次生成。取消、错误和输出截断不保存半篇；保存失败保留完整正文供复制或重新保存。保存通过 ST 单聊/群聊原生保存接口发送已固定目标的聊天快照，保留完整性检查，不强制覆盖。分支继承 ST 当时复制的元数据，旧日记不按楼层回退。

独立预览 `/?diary=1` 可直接进入日记；模型连接需在预览设置中添加，所有回复均为模拟且不请求真实模型。`diary-test=slow/error/length/save-error` 分别检查取消、生成错误、输出截断和保存失败；预览日记独立存于 localStorage，刷新后保留。

## 安装与运行要求

当前版本：**0.0.1**。资料与数据库功能需要 **[STE Memory](https://github.com/Etsuya233/ste-memory) 0.2.4 或更新版本**，该版本提供 `STE_MEMORY_API.database v1`。请先安装或升级 Memory，再刷新 ST。未连接 Memory 时，手机外壳、秒表及组件应用仍可使用。

在 SillyTavern「扩展 → 安装扩展」中填写：

| 插件               | 仓库 URL                                  | Branch or tag name           |
| ------------------ | ----------------------------------------- | ---------------------------- |
| STE Memory ≥ 0.2.4 | `https://github.com/Etsuya233/ste-memory` | `release/sillytavern-plugin` |
| STE Phone 0.0.1    | `https://github.com/Etsuya233/ste-phone`  | `release/sillytavern-plugin` |

安装后刷新页面，从聊天输入区的**魔法棒菜单 → 小手机**打开。更新使用 ST 扩展面板的 Update；升级 Phone 前请核对本节所需的 Memory 最低版本。`main` 分支用于源码开发，ST 安装请选择上述构建产物分支。

## 开始

使用 mise 固定 Node.js 与 pnpm 版本，不依赖 Corepack。

```sh
mise install
pnpm install --frozen-lockfile
pnpm preview:frontend
```

预览默认监听 `0.0.0.0:18826`，本机打开 `http://127.0.0.1:18826/`；同一局域网的设备使用终端输出的本机 IPv4 地址访问，例如 `http://192.168.1.10:18826/`。修改代码后刷新页面。可通过环境变量 `PORT` 改端口，`HOST` 改监听地址；只需本机访问时设置 `HOST=127.0.0.1`。

手机默认保持完整 iPhone 6s 机身比例，桌面和移动端均等比缩放至可用视口。`PhoneApp` 保留可选的全屏响应式模式和拖拽能力，默认关闭，也不显示操作柄。开发预览可通过 `?responsive=1` 开启窄屏全屏模式、`?draggable=1` 开启顶部机身拖拽，两项可组合；生产入口不读取这些参数。

打开手机后，点击主屏的「组件」（Foundation）图标进入组件应用，可操作导航栏、按钮、分组列表、开关、分段控件和页面滚动示例；导航示例包含列表、详情与下一层，返回保留滚动位置和控件状态；组件应用不连接或保存 ST 数据。开发预览也可用 `/?foundation=1` 快捷进入，可与上述参数组合；普通入口默认进入主屏。

Home 单击返回主屏，双击进入 Expose。已打开的 App 保留页面与状态，后台以 iOS 7 风格的横向页面预览显示，中央卡片与相邻卡片沿用各 App 的真实页面，下面是主屏同款图标和应用名称。界面只保留壁纸、卡片和图标，不显示额外入口、页码或提示。左右拖动或按方向键选卡，点击卡片/图标或 Enter 打开；上滑或 Delete 关闭应用，退出动画完成后卸载页面。关闭手机后重新打开回到原前台页，刷新 ST 会结束内存会话。秒表退到后台继续计时，仅在前台刷新显示。资料按聊天与范围重置导航栈，数据库工作区继续按聊天保留。

「设置 → 壁纸」显示默认渐变和 Phone 上传的图片，使用三列 9:16 缩略图。右上角「+」上传 PNG、JPEG 或 WebP（最大 10 MB），上传后进入全幅预览；选择 Blur 后点「设定」保存并返回图库。上传图片通过 ST 原生图片接口保存到 `data/<账号>/user/images/ste-phone-wallpapers/`，配置只保存所选路径与 Blur，图片内容留在账号目录，不改变 ST 背景。全局设置通过 `extensionSettings.ste_phone` 交给宿主延迟保存。

设置 schema 为 v3，包含壁纸与模型连接。首次读取 v1 时移除旧 URL 列表与旧背景选择，恢复默认渐变并保留 Blur；v2 保留壁纸与 Blur，补上空连接列表和未选择的默认连接。独立预览使用自己的 IndexedDB 保存 Blob、localStorage 保存配置，刷新时重新生成图片 URL；不连接真实 ST。`/?settings=1` 可快捷进入设置，同一局域网 HTTP 预览也支持上传。

「设置 → 模型连接」支持添加、编辑和删除命名连接，配置 OpenAI Chat Completions 兼容服务的 Base URL、API Key、模型 ID 与自定义请求头。Base URL 需要包含服务要求的路径前缀（如 `/v1`），不要填写完整 `/chat/completions` 地址。首个连接保存后自动设为默认，点击连接行选择默认，左侧勾选标记表示当前选择，右侧圆圈 i 进入编辑；也可选择「无默认」，删除默认连接后清空选择。保存显式提交草稿，返回时可确认舍弃；Home 与关闭手机保留草稿，Expose 退出设置或刷新结束草稿。

测试进度、模型回复和失败信息显示在手机内的 iOS 风格弹窗。运行中可取消，失败后可重试；「好」或 Escape 关闭弹窗，关闭运行中的弹窗会取消测试。Home 与关闭手机保留运行及弹窗状态，返回设置后继续查看。

模型请求在浏览器开发者工具 Console 中记录 `[STE Phone AI]` 日志，以 `requestId` 串联请求、HTTP 响应、完成或失败，并标注「日记生成」或「连接测试」。正常日志记录服务地址、模型、输出上限、消息角色和字符数、状态码及耗时，不主动打印鉴权和完整提示词。错误保留完整 HTTP 响应体、上游 SSE 错误、原始异常与原因链，不截断、不做密钥脱敏；同时写入 Pi 原生 diagnostics，应用包装错误时继续保留这些诊断。失败提示给出对应请求编号。

共享传输支持工具定义、工具调用增量、工具结果回传和 Pi Agent 的多轮工具循环；模型思考转换为独立 thinking 内容块。工具注册、思考展示及业务结果要求由应用决定。日记和连接测试目前不注册工具，收到意外工具调用由各应用终止，不触发后续模型请求；两者只提取最终文本，思考不展示、不保存为正文。只有思考而无正文由应用报空回复，输出截断保持各应用原有处理。

连接测试使用当前填写的配置，通过 Pi Agent 和 ST 同源 Custom 代理发送一次简短文本生成，支持流式、取消和 60 秒超时，可能产生少量用量；保存配置不会自动测试。首期仅验证文本生成，未接入业务生成或工具调用。API Key 可以留空，自定义 `Authorization` 优先于 API Key；无鉴权时显式使用空值，避免继承 ST Custom 连接的密钥。请求头名不区分大小写且不能重复，值可为空但不能含换行；`Content-Type` 固定 JSON，传输层请求头不可自定义。API Key 和请求头值明文保存在 Phone 的 ST 设置中，界面默认隐藏，不改变 ST 主连接或密钥。

独立预览的模型测试始终模拟，不联系配置的服务，回复中明确标记模拟结果；`model-test=slow`、`error`、`length` 可分别验收取消、失败与输出上限状态，例如 `/?settings=1&model-test=slow`。Pi 两包锁定 `0.83.0`。生产与预览共用设置模块的 Agent、提示词、输出限制与超时流程，预览仅替换为模拟 AI 传输；生产协议转换位于宿主适配器。

## 开发命令

主屏「资料」可以查看 STE Memory 的当前背景资料、搜索和复制正文。需要同时安装支持 `STE_MEMORY_API v1` 和 `database v1` capability 的 Memory 构建，展示映射支持「剧情记忆」预设；结构不符会明确提示。主屏「数据库」（Fake DBeaver）提供对象搜索、列与关联说明、只读 SQL 和结果复制，提供 `src_*` 源别名及 `phone_*` 标准视图。标准世界时间用 `SELECT date(world_time) FROM phone_world_state;` 查询。公共缓存跨 App 保留，刷新 ST 后重建视图连接，不写回 Memory；SQL 草稿、结果、搜索和滚动位置按聊天及资料范围保留在内存。独立预览使用示例数据，可用 `/?data-source=1` 或 `/?database=1` 快捷进入，加入 `data-state=empty`、`error`、`unavailable`、`unsupported` 检查状态。接口、映射和缓存说明见 [公共数据源](docs/data-source.md)。

```sh
pnpm build             # JS、CSS、manifest；清理旧 Worker/WASM
pnpm watch             # 增量构建；配置 .env 后自动同步到 ST
pnpm preview:frontend  # 独立预览，共用生产组件与 CSS
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test              # 串行验证工程接入、资料缓存、远端查询与标准视图 SQL
```

生产入口为 `src/frontend/index.ts`，与独立预览共用 `src/bootstrap/create-phone.tsx` 组装设置、资料、数据库工作区与应用页面，入口分别注入宿主或模拟适配器。`src/apps/<应用>/` 集中各应用业务与 `ui/` 页面；`src/frontend/host/mount-phone.tsx` 挂载 React 与 Shadow DOM，`phone-app.tsx` 管理窗口开关。`frontend/device/` 放机身与会话，`frontend/system/` 放状态栏与转场，`frontend/foundation/` 放基础视觉组件，`frontend/apps/home/` 放主屏，`NavigationStack` 提供保留 DOM 的页内导航，`frontend/theme.css` 汇总 CSS 与主题变量。React 随插件打包。字体优先使用 Apple 平台字体，Inter 西文字体通过 Google Fonts 加载，不进入产物；网络不可用时继续使用本机无衬线字体。构建产物的 manifest 版本与运行时版本统一读取 `package.json`。

全局设置与存储约定位于 `src/apps/settings/`，`public.ts` 提供壁纸读取、模型连接摘要与显式连接配置副本。公共资料、查询结构与来源缓存归 `src/apps/data-source/`，通过 `DataAppPublic` 供其他应用读取；`src/apps/database/` 只持有 SQL 草稿、结果、搜索与滚动等编辑工作区。Memory 数据库连接、协议和视图定义位于 `src/infrastructure/ste-memory/`，ST 设置、图片、AI 传输与聊天通知适配位于 `src/infrastructure/host/`；`src/core/ai/` 和 `src/core/chat/` 声明传输及当前聊天契约。各应用公开读取不依赖页面打开，跨应用仅通过所属模块的 `public.ts` 调用。职责与依赖见 [模块架构](docs/architecture.md)，资料接口与缓存见 [公共数据源](docs/data-source.md)。

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
pnpm deploy:st         # 生产构建，再拷贝三个发布文件并清理旧 Worker/WASM
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

公开仓库为 [Etsuya233/ste-phone](https://github.com/Etsuya233/ste-phone)，ST 安装分支为 `release/sillytavern-plugin`。发布分支 README 同步注明最低 Memory 版本，后续通过扩展面板的 Update 更新。

## 工作区

- `AGENTS.md`：协作与开发约定；`CLAUDE.md` 指向同一份规则。
- `tmp/`：本地外部参考资源，不进入 Git，已跟踪文件不得依赖其中内容。
- `.scratch/`：按功能组织的需求与本地 Issue，规则见 `docs/agents/issue-tracker.md`。
- `.worktrees/`：此主仓库的 Git Worktree，内容不进入 Git。
- `docs/agents/`：Issue、分诊标签与领域文档约定。
- `docs/ui/`：前端开发及验收约定。

前端开发与验证细节见 [前端开发规范](docs/ui/frontend-development.md) 和 [前端开发与验收](docs/ui/frontend-preview.md)。
