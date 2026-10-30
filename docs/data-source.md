# 手机公共背景资料

手机通过只读数据源取得当前对话的人物、纪要和物品。资料 App 负责查看；后续 App 共用同一契约和缓存。联系人备注、好友关系、消息和日记属于手机应用自己的数据，不写回背景来源。

## 契约与归属

`src/features/background/background.ts` 定义 `CharacterProfile`（id/name/profileText）、`Chronicle`（id/title/content）、`ItemProfile`（id/name/description）与 `PhoneBackground`。人物描述包含来源当前提供的身份、性格、经历和近况，不承诺信息完整或角色知情。

`sourceId` 表示提供者，`scopeId` 表示记忆空间，条目 ID 表示该空间中的源记录。改名不改变关联身份；克隆空间按新范围处理。聊天身份由数据源上下文单独跟踪，即使两个聊天共享空间，切换后也使旧读取失效。

`BackgroundDataSource` 提供 `getState()`、`subscribe()` 和 `load({ force? })`。同次读取去重，成功结果固定为不可修改的快照；来源变化使缓存失效，存在页面订阅时自动重读，无订阅时等下次使用。缓存属于插件挂载生命周期，退出 App、关闭手机仍保留，刷新 ST 页面后重建。不同对话不保留旧画面。

刷新失败保留同范围旧快照并标记过期，错误独立显示。旧请求的成功、失败和清理均不得影响新请求；读取过程中再次失效会放弃旧结果。调用失败时 App 不应继续生成内容。

## 代码组织与阅读顺序

```text
src/
├── features/background/
│   ├── index.ts                       # 对 App 与适配器公开的入口
│   ├── background.ts                  # 手机理解的资料类型
│   ├── data-source.ts                 # 读取、缓存与状态发布
│   ├── data-source.test.ts            # 公共读取行为验证
│   └── ports/background-provider.ts   # 外部来源需要实现的读取约定
├── infrastructure/ste-memory/
│   ├── memory-background-provider.ts # 连接 Memory 并转发变更通知
│   ├── public-read-contract.ts        # 外部协议类型，仅适配器内部使用
│   ├── map-background.ts              # 剧情记忆预设到手机资料的转换
│   └── map-background.test.ts         # 结构校验与文本转换验证
└── frontend/index.ts                  # 组装来源、共享数据源与手机
```

了解手机需要什么资料时先读 `background.ts`；了解读取和缓存行为时读 `data-source.ts`；修改 Memory 接入时再读 `infrastructure/ste-memory`。核心不依赖 ST、浏览器全局或具体适配器；预览与生产通过不同来源实现同一个读取约定。App 与适配器均从 `features/background/index.ts` 使用功能，ESLint 检查依赖方向。

读取流程在 `load` 中按“核对绑定、复用请求或缓存、发起读取”组织，异步结果在 `readAndPublish` 中完成归属检查、固定快照和状态发布。变更版本同时覆盖聊天切换和同聊天内更新；旧请求的结果、错误与清理不能影响新请求。

## Memory 接入

链路为 `STE_MEMORY_API v1 → MemoryBackgroundProvider → mapMemoryBackground → BackgroundDataSource → App`。不导入相邻源码，不打开 Memory 数据库，也不依赖调试 runtime。

Memory 的正式只读 API 与完整契约见其 `docs/public-read-api.md`。一次 Worker 调用取得已提交空间、表、字段和全部记录，不含历史、证据、任务、设置或密钥。读取前后核对聊天身份、空间及变更代次。绑定变化和 SQLite 已提交资料发布通过订阅通知，即使随后持久化失败也会失效；未提交填表数据不可见。SQL 控制台的未保存直接操作不属于公共数据源的更新保证。

首版明确适配「剧情记忆」预设：`characters`、`chronicle`、`items`。校验启用的表、名称和主要内容字段及类型；缺表或结构不符整份读取失败，不以空数组掩盖错误。支持空表，读取没有页数上限，不截断结果。其他预设和修改 Key 后的结构需要后续映射支持。

所有启用字段按字段位置拼接为带标签的文本，引用按同一快照中的当前显示策略展开为名称，不调用模型做摘要。人物同名允许共存，名称不参与身份匹配。纪要按记录创建时间升序、ID 升序排列，此顺序不表示剧情时间。

## 资料 App 与预览

主屏「资料」提供来源概览、人物/纪要/物品列表、名称与正文搜索、完整详情和复制正文。只读，不保存新业务数据。重进恢复概览，公共缓存仍可复用；聊天切换重置页面。

运行 `pnpm preview:frontend`，使用 `/?data-source=1` 直接进入资料 App。可加入 `data-state=empty`、`error`、`unavailable` 验证对应状态；可与 `responsive=1` 组合。预览使用 `docs/ui/data-source-fixture.ts`，不访问 ST。

工程检查覆盖缓存共享、刷新失败、同空间聊天切换、读取途中失效、同名及改名引用、完整记录数、空表与结构错误。真实 ST 验收关注两个插件加载次序、Memory 更新通知、聊天绑定变化和宿主样式隔离。

## 本轮验收（2026-10-30）

手机类型检查、Lint、格式、构建及 12 项测试通过；Memory 相关 6 个测试文件共 117 项通过，覆盖运行时接线、正式读取边界、SQLite 快照隔离、提交后缓存失败通知和运行库重载。

Edge 无头浏览器通过概览、三类资料、正文搜索、详情、复制、返回、跨 App 导航、空态/错误态/未连接状态，以及 320px、390px 和可选全屏布局。真实 ST 使用独立 dataRoot，验证正式接口读取、人物改名与引用自动更新、纪要删除、两个聊天间切换和切回恢复；无 pageerror，无模型生成请求。未修改用户聊天。两个扩展目录均确认通过 Junction 指向对应仓库的 dist。

未覆盖真实手机、其他浏览器及用户自定义表格映射；跨插件加载顺序由接口已有检测与 ready 通知处理，未穷举所有扩展启动组合。
