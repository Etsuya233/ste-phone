# 前端开发规范

使用 React、TypeScript、普通 CSS 和 esbuild。生产入口为 `src/frontend/index.ts`，挂载位于 `src/frontend/host/mount-phone.tsx`，当前窗口在 `src/frontend/phone-app.tsx`，样式在 `src/frontend/theme.css`。不引入 Tailwind 与组件库。

插件在独立 Shadow DOM 内挂载，样式通过 bundle 同目录的 `style.css` 加载。manifest 也声明该样式，所有选择器必须以 `:host` 限定，确保 ST 在全局加载同一文件时不会影响宿主。手机弹层使用原生 dialog，内部内容位于同一 Shadow DOM。新增浮层也保持这条边界。

独立预览入口为 `docs/ui/frontend-preview.tsx`，与生产共用挂载、React 组件和样式，禁止在生产中引用预览或 tmp 资源。

开发前明确状态属于全局设置、ST 当前对话或手机内部会话，以及读取、写入和离开页面的行为。已有公共组件与业务能力优先复用，ST 接线与页面展示保持清晰边界。

先完成窄屏的完整操作流程，再适配桌面。处理宿主全局样式对插件控件、浮层和文字的影响，插件样式也不得污染宿主。

异步操作应绑定发起时的对话和会话身份，验证切换后的响应归属。写入流程明确区分提交与持久化结果，错误应可见。

验收覆盖成功、空态、失败、切换上下文以及涉及编辑时的未保存离开。公共组件修改需要验证调用页面；ST 接入与持久化需要在真实宿主内验证。预览要求见 [前端开发与验收](frontend-preview.md)。
