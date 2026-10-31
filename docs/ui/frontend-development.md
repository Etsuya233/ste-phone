# 前端开发规范

使用 React、TypeScript、普通 CSS 和 esbuild。生产入口为 `src/frontend/index.ts`，生产和预览共用 `src/bootstrap/create-phone.tsx` 组装模块与应用页面，入口分别注入宿主或模拟适配器。应用业务与页面集中在 `src/apps/<应用>/`，挂载位于 `src/frontend/host/mount-phone.tsx`，当前窗口在 `src/frontend/phone-app.tsx`，样式在 `src/frontend/theme.css`。不引入 Tailwind 与组件库。

插件在独立 Shadow DOM 内挂载，样式通过 bundle 同目录的 `style.css` 加载。manifest 也声明该样式，所有选择器必须以 `:host` 限定，确保 ST 在全局加载同一文件时不会影响宿主。手机弹层使用原生 dialog，内部内容位于同一 Shadow DOM。新增浮层也保持这条边界。

生产入口位于 ST 魔法棒菜单 `#extensionsMenu`，通过 `host/st-entry.tsx` 的 React portal 挂载到宿主文档，使用 ST 原生 `list-group-item`、图标和文字样式，不应用 Phone 的 CSS。`index.ts` 在加载时校验宿主菜单及按钮，将节点经 `mountPhone` 的 `menuEntry` 传给 `PhoneApp`。打开前通过魔法棒按钮关闭宿主菜单，关闭手机后焦点回到该按钮。独立预览省略 `menuEntry`，保留右下角入口与原来的焦点恢复行为。

独立预览入口为 `docs/ui/frontend-preview.tsx`，与生产共用挂载、React 组件和样式，禁止在生产中引用预览或 tmp 资源。

## Foundation

基础组件位于 `src/frontend/foundation/`，每个组件的 TSX 与 CSS 分文件存放，`foundation.tsx` 仅显式导出，`foundation.css` 汇总样式。页面使用组件提供的视觉，自己的 CSS 只调整布局；颜色、字体、间距、控件尺寸统一读取 `tokens.css`。

字体优先使用 Apple 平台字体，Inter 西文字体由挂载入口通过 Google Fonts 声明，不打包字体文件；字体网络请求不阻塞手机使用。资料搜索只展示 Placeholder，并保留 `aria-label`，聚焦时不显示 outline。来源信息使用展开的 `GroupedList` 与静态 `ListCell`，属性名居左、属性值居右。

`Page` 使用 `navBar` 和 `footer` 插槽。导航栏独立使用 `NavBar`，返回文案及行为由调用方传入，右侧操作使用 `right` 插槽。提供底栏时必须指定逻辑像素高度 `footerHeight`，页面据此同步内容 padding、scroll-padding 与底栏高度。`SafeArea` 在 Page 内统一消费底部安全区，业务页面不重复预留。内容层为唯一滚动容器，顶栏、底栏和系统状态栏固定叠放。

`Switch` 使用受控 `checked` / `onCheckedChange`，`SegmentedControl` 使用受控 `value` / `onValueChange`；状态属于调用页面，不在组件内部复制或持久化。分段控件使用同组原生 radio 的键盘行为。`ListCell` 的点击行与带尾部交互控件的静态行分开使用，避免嵌套按钮。按钮默认 `type="button"`，用于表单提交时显式指定 `type="submit"`。

Foundation 组件应用位于 `src/apps/foundation/ui/`，可从主屏打开，也可通过独立预览的 `?foundation=1` 快捷进入。应用共用生产组件和 CSS，自有样式只调整布局；开发预览入口仍位于 `docs/ui/`，生产代码不引用该入口。新增组件需有实际页面或明确的组件应用验收场景。

`NavigationStack` 接收初始路由和路由渲染函数，入栈后保留之前页面的 DOM、控件状态与滚动容器；仅在出栈动画完成后移除顶页。隐藏页使用 `hidden` 和 `inert`，转场期间阻止重复导航，支持减少动态效果，返回恢复触发入口的焦点。路由页需各自拥有页面状态，异步数据由共享服务更新。外层 `active` 控制前台焦点与副作用，后台页不得抢焦点；聊天归属变化通过栈的 key 重建资料栈，数据库工作区仍由原服务按聊天拥有。

页内滑动保持两层页面不透明，上一页只位移，当前页用边缘投影表达层次，避免整页透明度变化透出壁纸。Home 桌面名称使用独立阴影 token，Dock 只显示图标并保留按钮的无障碍名称。

## 手机会话与设置

`src/bootstrap/create-phone.tsx` 向外壳提供各 App 的渲染定义，外壳只管理挂载与界面生命周期，不导入各 App 内部实现。各 App 首次打开时挂载，Home 退到后台；Expose 以 iOS 7 风格横向展示真实页面预览，只有明确退出动画完成才卸载 App 页面。固定 App 数量无需淘汰策略。dialog 关闭保留 `PhoneDevice` 和各 App 的内存会话，重开恢复原前台页，刷新 ST 结束会话。后台 App 保持 DOM，平时使用 `hidden`；Expose 只在原父节点上缩放、位移这些页面，内容 wrapper 始终按 `active` 使用 `inert` 与 `aria-hidden`。预览点击和手势由独立透明层处理，不复制 App、截取页面或改变组件 key。拖动时 memo 保留 App 组件，避免手势刷新整页内容。秒表使用 `performance.now()` 累计后台时间，`active` 只允许前台执行显示 RAF；状态栏关闭时停止时钟定时器。DB 滚动监听与恢复仅在前台页执行，避免隐藏容器的零尺寸污染按聊天的滚动缓存。

物理与软件 Home 共用 280ms 单双击判断，双击进入 Expose，单击返回主屏。Expose 只显示壁纸、横向露边卡片、共享 AppIcon 图标与应用名称，不显示独立状态栏、提示、页码、切换箭头或主屏/退出按钮；主屏也不额外提供后台入口。左右拖动或方向键选择，点按或 Enter 打开，上滑 90 个逻辑像素或 Delete 退出。只有当前卡参与 Tab，删除后聚焦邻卡，全部退出后只保留壁纸并聚焦后台区域，Home 仍可返回主屏。关闭、卸载与页面变更取消待处理的单击。关闭发生于动画期间时收敛到动画目标，清除拖动，并完成正在退出的应用，避免重开卡在转场。减少动态效果关闭卡片与轨道的补间动画。

全局壁纸由 `src/apps/settings/settings-service.ts` 的 `PhoneSettingsService` 持有，设置页面只消费注入的服务。外壳通过 `src/apps/settings/public.ts` 的 `WallpaperReader` 订阅含图片 URL 的只读快照；模型消费者通过 `ModelConnectionsReader` 读取无凭据摘要，并显式取得独立连接配置副本。设置页面尚未打开或已退出时，这些读取仍然有效。图库只包含默认渐变和 Phone 上传的图片，三列 9:16 竖向缩略图，不显示文件名、说明或成功提示。「+」选择图片，实际解码通过后上传，成功进入独立全幅预览页；Blur 只修改预览，点「设定」保存并返回图库。导航栈保留图库滚动与页面状态，上传完成时页面退到后台则等待它回到前台再进入预览；离开已卸载的图库不发布迟到响应。

生产接线使用 ST 的公开 `getContext()`、`extensionSettings.ste_phone`、`saveSettingsDebounced()`，图片通过 `POST /api/images/upload` 和 `POST /api/images/list`。固定 `ch_name` / `folder` 为 `ste-phone-wallpapers`，文件名使用 `crypto.getRandomValues()` 生成 128 位唯一值，原文件名和用户路径不进入请求。浏览器实际解码图片，核心服务限定 PNG、JPEG、WebP 与 10 MB；读取/上传失败显示简短错误，读取可重试，默认渐变始终可选。v4 设置保存所选图片路径、Blur、模型连接、默认连接和主屏/Dock 有序应用 ID；v3 升级添加默认布局与 App Store；v1 旧地址列表与背景选择显式迁移为默认渐变，Blur 保留；v2 保留已有壁纸并补空连接。壁纸和连接使用服务的语义方法更新当前设置，页面不提交全量设置快照。

模型连接列表与编辑页使用相同 NavigationStack，TextField 提供带标签的输入及尾部显隐操作。连接以稳定 ID 关联默认选择，支持无默认；整行用原生 radio 选择，左侧显示蓝色勾，右侧圆圈 i 按钮独立进入编辑，不嵌套交互控件。编辑页按草稿显式保存，未保存返回显示页内舍弃确认并滚入可见区域。连接测试由设置模块接收 `AiTransport` 创建，页面提交当前草稿；模块持有 Pi Agent、提示词、输出限制和 60 秒超时策略。Core 在 `src/core/ai/public.ts` 声明绑定连接快照的 `createStream` 契约，`src/infrastructure/host/ai-transport.ts` 通过宿主 Custom 代理发送请求并转换 Pi 文本事件；每次调用独立，不读取 ST 当前模型或生成参数。当前仅支持文本，工具和思考内容明确报错。修改请求字段、页内返回与卸载取消当前测试，Home、Expose 预览及关闭手机保留运行。迟到结果只由发起它的控制器接收，后台不抢焦点或导航；确认和配置错误仅当前页聚焦。生产请求的 CSRF 等宿主头与上游自定义头分开处理，错误信息脱敏且不输出完整请求。独立预览注入 `docs/ui/preview-ai-transport.ts` 的可控模拟传输，复用相同 Agent 与连接测试流程，不请求真实模型服务。

Foundation Alert 在当前 App 的页面坐标内绘制遮罩、圆角半透明面板与底部分隔操作，不使用跨出手机屏幕的顶层 dialog。连接测试用 Alert 展示流式进度、成功回复及失败重试，底层 Page 设为 inert；仅前台 Alert 获取焦点，Tab/Shift+Tab 留在操作区，Escape 关闭弹窗且不关闭外层手机。关闭后恢复测试按钮焦点；Home 与关闭手机保留弹窗和调用，回前台再聚焦。正文超长时面板内滚动，操作按钮始终可达，减少动态效果时停用加载动画。

独立预览在 `docs/ui/preview-wallpapers.ts` 使用 IndexedDB 的 Blob 存储和自增 ID，localStorage 只保存稳定 ID 与设置。启动时从 Blob 重建会话 object URL，图片 URL 不写入持久配置，不使用安全上下文限定的 randomUUID。对象 URL 生命周期覆盖 Home、Expose 和 dialog 关闭，页面真正卸载时统一回收；BFCache 暂存时保持可用。预览资源和生产接线互相隔离。壁纸位于独立背景层，Blur 只作用于该层。

资料业务和查询缓存由 `src/apps/data-source/data-service.ts` 持有，数据库通过资料的 `public.ts` 读取结构和执行查询，自有 `DatabaseWorkspace` 仅管理编辑工作区。Core `ChatContext` 由 ST 适配器独立发布当前聊天身份，无 Memory 时仍可读取；资料请求继续显式携带自己的聊天与范围归属。应用定义可接收前后台、窗口显隐及 Expose 退出通知，任务取消与保存策略由应用决定。

## 状态与验收

开发前明确状态属于全局设置、ST 当前对话或手机内部会话，以及读取、写入和离开页面的行为。已有公共组件与业务能力优先复用，ST 接线与页面展示保持清晰边界。

先完成窄屏的完整操作流程，再适配桌面。处理宿主全局样式对插件控件、浮层和文字的影响，插件样式也不得污染宿主。

异步操作应绑定发起时的对话和会话身份，验证切换后的响应归属。写入流程明确区分提交与持久化结果，错误应可见。

验收覆盖成功、空态、失败、切换上下文以及涉及编辑时的未保存离开。公共组件修改需要验证调用页面；ST 接入与持久化需要在真实宿主内验证。预览要求见 [前端开发与验收](frontend-preview.md)。

## 主屏与 App Store

应用静态目录位于 `src/core/launcher/catalog.ts`，统一 ID、名称、描述与卸载权限。设置模块通过 `HomeScreenSettings` 公开安装、卸载、移动及只读布局快照，生产与预览共用 v4 配置迁移；主屏和 App Store 不各自持有可修改的安装状态。主屏拖动只更新手势内草稿，松手提交移动，取消手势恢复已保存布局。长按、右键或 F2 进入编辑，点击主屏空白处、Home 或 Escape 退出；关闭手机时结束编辑与未提交手势。资料、设置、App Store 可移动但不可卸载，Dock 容量四个。卸载保存成功后外壳通知运行中应用退出并移除会话，业务存储不清空；重新安装追加到主屏末尾。App Store 页面通过 bootstrap 注入系统打开应用的回调，不直接导入设备实现。
