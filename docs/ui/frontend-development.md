# 前端开发规范

使用 React、TypeScript、普通 CSS 和 esbuild。生产入口为 `src/frontend/index.ts`，挂载位于 `src/frontend/host/mount-phone.tsx`，当前窗口在 `src/frontend/phone-app.tsx`，样式在 `src/frontend/theme.css`。不引入 Tailwind 与组件库。

插件在独立 Shadow DOM 内挂载，样式通过 bundle 同目录的 `style.css` 加载。manifest 也声明该样式，所有选择器必须以 `:host` 限定，确保 ST 在全局加载同一文件时不会影响宿主。手机弹层使用原生 dialog，内部内容位于同一 Shadow DOM。新增浮层也保持这条边界。

生产入口位于 ST 魔法棒菜单 `#extensionsMenu`，通过 `host/st-entry.tsx` 的 React portal 挂载到宿主文档，使用 ST 原生 `list-group-item`、图标和文字样式，不应用 Phone 的 CSS。`index.ts` 在加载时校验宿主菜单及按钮，将节点经 `mountPhone` 的 `menuEntry` 传给 `PhoneApp`。打开前通过魔法棒按钮关闭宿主菜单，关闭手机后焦点回到该按钮。独立预览省略 `menuEntry`，保留右下角入口与原来的焦点恢复行为。

独立预览入口为 `docs/ui/frontend-preview.tsx`，与生产共用挂载、React 组件和样式，禁止在生产中引用预览或 tmp 资源。

## Foundation

基础组件位于 `src/frontend/foundation/`，每个组件的 TSX 与 CSS 分文件存放，`foundation.tsx` 仅显式导出，`foundation.css` 汇总样式。页面使用组件提供的视觉，自己的 CSS 只调整布局；颜色、字体、间距、控件尺寸统一读取 `tokens.css`。

字体优先使用 Apple 平台字体，Inter 西文字体由挂载入口通过 Google Fonts 声明，不打包字体文件；字体网络请求不阻塞手机使用。资料搜索只展示 Placeholder，并保留 `aria-label`，聚焦时不显示 outline。来源信息使用展开的 `GroupedList` 与静态 `ListCell`，属性名居左、属性值居右。

`Page` 使用 `navBar` 和 `footer` 插槽。导航栏独立使用 `NavBar`，返回文案及行为由调用方传入，右侧操作使用 `right` 插槽。提供底栏时必须指定逻辑像素高度 `footerHeight`，页面据此同步内容 padding、scroll-padding 与底栏高度。`SafeArea` 在 Page 内统一消费底部安全区，业务页面不重复预留。内容层为唯一滚动容器，顶栏、底栏和系统状态栏固定叠放。

`Switch` 使用受控 `checked` / `onCheckedChange`，`SegmentedControl` 使用受控 `value` / `onValueChange`；状态属于调用页面，不在组件内部复制或持久化。分段控件使用同组原生 radio 的键盘行为。`ListCell` 的点击行与带尾部交互控件的静态行分开使用，避免嵌套按钮。按钮默认 `type="button"`，用于表单提交时显式指定 `type="submit"`。

Foundation 组件应用位于 `src/frontend/apps/foundation/`，可从主屏打开，也可通过独立预览的 `?foundation=1` 快捷进入。应用共用生产组件和 CSS，自有样式只调整布局；开发预览入口仍位于 `docs/ui/`，生产代码不引用该入口。新增组件需有实际页面或明确的组件应用验收场景。

`NavigationStack` 接收初始路由和路由渲染函数，入栈后保留之前页面的 DOM、控件状态与滚动容器；仅在出栈动画完成后移除顶页。隐藏页使用 `hidden` 和 `inert`，转场期间阻止重复导航，支持减少动态效果，返回恢复触发入口的焦点。路由页需各自拥有页面状态，异步数据由共享服务更新。外层 `active` 控制前台焦点与副作用，后台页不得抢焦点；聊天归属变化通过栈的 key 重建资料栈，数据库工作区仍由原服务按聊天拥有。

## 手机会话与设置

五个 App 首次打开时挂载，Home 退到后台；Expose 以 iOS 7 风格横向展示真实页面预览，只有明确退出动画完成才卸载 App 页面。固定 App 数量无需淘汰策略。dialog 关闭保留 `PhoneDevice` 和各 App 的内存会话，重开恢复原前台页，刷新 ST 结束会话。后台 App 保持 DOM，平时使用 `hidden`；Expose 只在原父节点上缩放、位移这些页面，内容 wrapper 始终按 `active` 使用 `inert` 与 `aria-hidden`。预览点击和手势由独立透明层处理，不复制 App、截取页面或改变组件 key。拖动时 memo 保留 App 组件，避免手势刷新整页内容。秒表使用 `performance.now()` 累计后台时间，`active` 只允许前台执行显示 RAF；状态栏关闭时停止时钟定时器。DB 滚动监听与恢复仅在前台页执行，避免隐藏容器的零尺寸污染按聊天的滚动缓存。

物理与软件 Home 共用 280ms 单双击判断，双击进入 Expose，单击返回主屏。Expose 只显示壁纸、横向露边卡片、共享 AppIcon 图标与应用名称，不显示独立状态栏、提示、页码、切换箭头或主屏/退出按钮；主屏也不额外提供后台入口。左右拖动或方向键选择，点按或 Enter 打开，上滑 90 个逻辑像素或 Delete 退出。只有当前卡参与 Tab，删除后聚焦邻卡，全部退出后只保留壁纸并聚焦后台区域，Home 仍可返回主屏。关闭、卸载与页面变更取消待处理的单击。关闭发生于动画期间时收敛到动画目标，清除拖动，并完成正在退出的应用，避免重开卡在转场。减少动态效果关闭卡片与轨道的补间动画。

全局壁纸由 `PhoneSettingsService` 持有，页面只消费注入的服务。生产接线使用 ST 的公开 `getContext()`、`extensionSettings.ste_phone`、`saveSettingsDebounced()` 和 `/api/backgrounds/all`；预览独立使用 localStorage 与示例背景。自定义地址仅接受 HTTP/HTTPS，图片验证期间锁定输入与应用，加载失败显式展示；背景读取失败可重试。应用反馈只说明已应用并交给宿主保存，不声称已确认服务端持久化。壁纸位于独立背景层，Blur 只作用于该层。

## 状态与验收

开发前明确状态属于全局设置、ST 当前对话或手机内部会话，以及读取、写入和离开页面的行为。已有公共组件与业务能力优先复用，ST 接线与页面展示保持清晰边界。

先完成窄屏的完整操作流程，再适配桌面。处理宿主全局样式对插件控件、浮层和文字的影响，插件样式也不得污染宿主。

异步操作应绑定发起时的对话和会话身份，验证切换后的响应归属。写入流程明确区分提交与持久化结果，错误应可见。

验收覆盖成功、空态、失败、切换上下文以及涉及编辑时的未保存离开。公共组件修改需要验证调用页面；ST 接入与持久化需要在真实宿主内验证。预览要求见 [前端开发与验收](frontend-preview.md)。
