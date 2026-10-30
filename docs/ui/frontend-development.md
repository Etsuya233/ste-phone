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

## 状态与验收

开发前明确状态属于全局设置、ST 当前对话或手机内部会话，以及读取、写入和离开页面的行为。已有公共组件与业务能力优先复用，ST 接线与页面展示保持清晰边界。

先完成窄屏的完整操作流程，再适配桌面。处理宿主全局样式对插件控件、浮层和文字的影响，插件样式也不得污染宿主。

异步操作应绑定发起时的对话和会话身份，验证切换后的响应归属。写入流程明确区分提交与持久化结果，错误应可见。

验收覆盖成功、空态、失败、切换上下文以及涉及编辑时的未保存离开。公共组件修改需要验证调用页面；ST 接入与持久化需要在真实宿主内验证。预览要求见 [前端开发与验收](frontend-preview.md)。
