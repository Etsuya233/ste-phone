# 手机公共资料与数据库

## 清洗后的最近聊天

`DataAppPublic.readRecentChat({ chatIdentity, scopeId, count })` 经资料来源适配器调用 Memory 可选 `chat v1.readRecent({ chatIdentity, count })`。请求中的聊天身份属于资料来源，与 Core 的聊天文件身份分别校验。返回原始楼层、发送者、消息类型、清洗后正文及清洗规则摘要的固定副本，不经过 Memory SQL，不复制聊天到 Phone 数据库。

Memory 从 ST 当前生效消息中排除系统、工具和隐藏消息，保留正常旁白；隐藏旁白仍排除。先取最近 N 条窗口，再使用当前聊天规则清洗 AI 输出，用户消息及旁白保留正文，清洗后为空的消息移除且不向前补齐。不读取 swipe 备选、思考或附件。未选或停用规则明确报告未启用，悬空规则报错。缺少 capability、读取错误和上下文切换均明确失败，不切换到 ST 原文；切走再切回也不接受旧读取结果。

日记使用此接口读取最近 20 条参考消息，生成中固定已取得的文本和规则摘要。世界状态及纪要时间仍通过既有标准视图查询；`readBackground()` 的人物、纪要和物品展示结构保持原有职责。

Phone 定义标准查询结构，Memory 执行 SQL 并提供当前已提交资料。资料模块的 `PhoneDataService` 拥有来源结构、查询与背景缓存，Fake DBeaver 通过 `DataAppPublic` 共享这些能力，并由自己的 `DatabaseWorkspace` 保存编辑会话。Phone 只持有来源结构、视图 SELECT、查询结果与页面会话。生产插件不加载 SQLite/WASM，不调用 `STE_MEMORY_API.read()`，也不复制完整 records。

## 契约与归属

Memory 保留公开读取 v1 的 `getContext/subscribe/read`，Phone 要求额外的 `database.version === 1` 与 `identity.version === 1` capability：`describe` 返回空间、启用表/字段、公开列名、`schemaKey` 与数据库加载生命周期 `databaseKey`，不含 records；`registerViews` 在 `ste_phone` namespace 原子注册整组视图；`query` 接受当前聊天、空间、结构身份、SQL、命名参数及执行预算。Phone 只定义外部协议类型，不导入相邻仓库源码，不访问 Memory 内部实体表、调试 runtime 或历史。

`sourceId/scopeId/record_id` 标识当前来源实例，负责请求归属、SQL 关联和编辑会话隔离；聊天身份独立参与校验，即使两个聊天共享稳定资料身份也不能混用异步结果。`describe().space.stableId` 与业务系统列 `$stable_id` 提供跨导出、导入及分支克隆保留的稳定身份，标准视图将它们公开为 `stable_scope_id/stable_record_id`。实例身份在克隆后改变，稳定身份允许不同分支保留同一人物及不同资料。查询反映执行时 Memory 当前 committed 数据，未提交内容不可见；多次查询和资料分页允许弱一致性，不建立历史快照会话。

首次使用或收到来源更新后的下一次操作先 `describe`。结构身份与数据库加载生命周期均未变时沿用已注册视图；结构改变、空间卸载后重进或同聊天重新加载数据库时重新注册。Memory 负责在每次数据 publish 重建数据库后恢复已注册 namespace 视图。普通记录变更只标记现有结果与资料缓存过期，不读取全部数据、不自动重查、不重建 Phone 数据库。重新查询自然读取最新 committed 数据。结构检查或查询失败显示具体错误，同聊天旧结果保留并标过期。

## 代码位置

`src/apps/data-source/public.ts` 定义跨应用只读契约 `DataAppPublic`、来源快照和显式请求归属；`database.ts` 定义结构、结果与 SQL 值，`ports/database-provider.ts` 声明外部查询来源契约。`data-service.ts` 的 `PhoneDataService` 管理来源变化、结构检查、请求去重、聊天归属与背景缓存，`query-background-provider.ts` 通过同一资料公开查询能力分页读取标准视图，交给内部 `BackgroundDataSource` 缓存。

`src/infrastructure/ste-memory/memory-database-provider.ts` 对接正式 capability，`map-database.ts` 根据公开结构生成 SELECT。`src/apps/database/database-workspace.ts` 的 `DatabaseWorkspace` 只通过资料公开入口读取结构与查询，持有 SQL 草稿、结果、错误、搜索和滚动状态。`src/bootstrap/create-phone.tsx` 为生产和预览组装同一个资料服务，再注入数据库工作区；资料不依赖数据库应用或其编辑会话，公开能力也不依赖资料页面挂载。

`PhoneBackground` 只保存展示实际需要的人物、纪要与物品。资料读取每页 200 行，按创建时间和记录 ID 排序，读取到最后一页；单页意外截断会明确失败。它不读取自定义表 records，不以 200 行静默截断完整资料。来源通知只使缓存过期，用户刷新或下一次 `readBackground` 时读取。来源更新期间完成的旧读取不能覆盖新状态。

## 源别名与标准视图

所有 `src_<table.key>` 都是 Memory 公开业务表的别名 VIEW。字段 key 保持原样，布尔值使用 0/1，多值使用 JSON 数组，引用使用记录 ID。对象说明包含原始字段 ID、类型及引用目标。源别名提供 `_phone_source_id`、`_phone_scope_id`、`_phone_record_id`、`_phone_stable_scope_id`、`_phone_stable_record_id`、`_phone_created_at`、`_phone_updated_at`、`_phone_display_text`，记录稳定身份从 `$stable_id` 取得，其他记录属性从公开系统列 `$record_id/$display_text/$created_at/$updated_at` 取得值。停用表/字段不在公开 SQL 结构内。

| 标准对象                     | 主要内容                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `phone_characters`           | 身份、`name/profile_text/personality/background/current_status`              |
| `phone_chronicles`           | 身份、`title/content/start_time/end_time/related_character_ids/profile_text` |
| `phone_items`                | 身份、`name/description/owner_id/status/profile_text`                        |
| `phone_world_state`          | 身份、`name/world_time/current_location/weather/clothing/other_scenes`       |
| `phone_chronicle_characters` | `source_id/scope_id/chronicle_id/character_id` 及稳定身份列，展开完整关系    |
| `phone_capabilities`         | `object_name/status/detail`，明确报告 supported 或 unsupported 及原因        |

人物、纪要、物品和世界状态视图的身份列包含 `source_id/scope_id/record_id/stable_scope_id/stable_record_id/created_at`，关联视图保留当前记录 ID，并提供 `stable_scope_id/stable_chronicle_id/stable_character_id`。人物稳定身份通过当前人物视图关联取得，悬空人物引用保留原关系行及空稳定人物身份。各标准视图要求所声明来源字段启用、类型及引用目标兼容；无法映射时不注册该标准视图，在 `phone_capabilities` 说明原因，公开源别名仍可查询。支持的空表正常返回零行。资料展示依赖三类标准视图，任一不可用时显示具体映射错误。

`profile_text` 由 SQL 按启用字段位置拼接标签和值，JSON 多值完整展开，引用名称按目标表当前显示策略生成；显示策略字段不可用或出现循环引用时明确报告 unsupported。人物改名后无需重建视图即可显示新引用名称。纪要创建顺序不代表剧情时间，世界日期仅取来源 `current_time`，不以设备时间替代。

```sql
SELECT date(world_time) AS world_date, current_location FROM phone_world_state;
SELECT date("current_time") FROM src_story_state;
SELECT c.name, m.title, m.start_time
FROM phone_chronicle_characters link
JOIN phone_characters c ON c.record_id = link.character_id
JOIN phone_chronicles m ON m.record_id = link.chronicle_id;
SELECT * FROM phone_capabilities WHERE status = 'unsupported';
```

迁移兼容变化：旧的 `_phone_payload_json`、`_phone_record_json`、源表 `_phone_profile_text` 及 `phone_source_space/phone_source_tables/phone_source_fields` 元数据副本已移除；原始公开列和 JSON 多值可直接查询，结构说明由 `describe` 提供。旧方案的历史决策保存在 ADR 0001，由 ADR 0002 取代。

## 查询与页面状态

`DataAppPublic.getSnapshot()` 与 `subscribe()` 提供稳定只读来源快照，包含当前上下文、来源 ID、背景资料、过期与错误状态及更新修订号。`readBackground({ chatIdentity, scopeId, force? })` 读取背景资料；`describe({ chatIdentity, scopeId }, { force? })` 读取查询结构；`query({ chatIdentity, scopeId, sql, params? })` 转发查询给 Memory，命名绑定使用 `:name`。请求和返回均校验发起时的聊天及范围，切换后的旧请求明确失败；已有背景快照保持固定，查询结果以只读副本交付。Memory 执行单条只读 SQL，默认 200 行、750 ms，返回 `columns/rows/elapsedMs/truncated/maxRows`；截断和失败由页面明确显示。只允许公开业务表及当前 namespace 的视图，写入、内部 schema、危险函数、PRAGMA 和多语句由 Memory 拒绝，超时后可继续查询。

SQL 草稿、结果、错误、对象选择、搜索和滚动位置按聊天与范围保留在插件内存，退出 App 或关闭手机后恢复，刷新 ST 清空。来源更新后结果显示过期，检查视图结构不将旧结果伪装成新结果，重新执行后更新。联系人备注、好友关系、消息和日记属于 Phone 独立拥有的业务数据，后续按聊天保存；semantic 接入后置。

日记作者现有 `scopeId/id` 字段分别保存稳定空间与人物身份，数据版本和持久化形状保持 v1。作者读取先检查 `stableScopeId`，再通过 `stable_record_id` 找到当前人物实例，以本次查询的 `record_id` 读取关联纪要。旧快照稳定身份由原 ID 初始化，因此 Phone 不批量迁移日记，也不按姓名自动匹配。完整身份约定见 [ADR 0008](adr/0008-stable-memory-identity.md)。

## 预览与验收

独立预览 `/?database=1`、`/?data-source=1` 复用生产页面及适配器，`data-state=empty/error/unavailable/unsupported` 检查对应状态。`docs/ui/data-source-fixture.ts` 提供独立 Fake Memory capability，`preview-sqlite.ts` 仅用于预览真实 SQL，SQLite 包属于 devDependency，WASM 仅复制到预览输出目录。生产只发布 `index.js/style.css/manifest.json`。build、watch、sync 和 release 会清理受管理的旧 Worker/WASM，保留用户其他文件。

工程检查应串行执行类型、Lint、格式、测试与构建。测试用 Node 内置 SQLite 验证生成视图、当前引用名称、关联和日期，服务测试覆盖数据通知不复制、不调用 read、结构变更重新注册、完整分页、聊天异步归属与旧结果过期。真实 Memory 的只读授权、执行预算与 publish 生命周期由 Memory 测试验证。预览和真实 ST 的操作验收需另行记录，旧本地投影方案的历史验收不能作为新链路的通过证据。

### 稳定身份验收（2026-11-01）

Phone 全套 96 项串行测试及类型、Lint、格式、构建通过；纪要取材职责整理后再次通过相关 30 项测试及工程检查。Memory 最终 131 个测试文件、1399 项测试及类型、Lint、格式、构建通过。Phone 日记 v1 存储结构保持原样。

跨仓集成使用 Memory 真实 SQLite WASM、正式 `PublicMemoryReader` 及 Phone 的来源适配器、资料服务和日记取材流程。旧 schema v2 快照按原 ID 迁移后，连续执行两轮导出、备份编解码、克隆及重新加载：实例空间与记录 ID 均改变，原作者对象保持不变，仍能读取正确人物和关联纪要。替换为其他稳定空间、使用旧聊天身份请求均被拒绝。验收未请求模型或修改用户聊天；本轮未重新进行浏览器和真实 ST 文件保存验收。

### 本轮验收（2026-10-30）

Phone 类型、Lint、格式、19 项串行测试及生产构建通过；聊天切换加载修复后再次通过类型检查与构建。Memory 相关 81 项测试通过，包含真实 WASM 的只读查询、视图发布生命周期、结构变更、运行库重载与公开绑定检查；数据库加载标识兼容调整后，5 项数据库测试及构建再次通过。

Edge 预览通过对象/列说明、源别名、标准视图、关联查询、只读拒绝、截断、超时恢复、对象返回滚动恢复、Home/关闭后恢复草稿和结果，以及 1280px、320px、390px 布局。资料 App 的搜索、详情、复制、空态、失败、未连接和可选全屏回归通过，无页面错误。预览使用的 WASM 不进入生产构建。

隔离 ST 验收通过人物/纪要 JOIN、世界日期、只读刷新、手动记录更新、Agent 提交链路、字段显示标签变更、聊天切换与切回，以及关闭期间切换聊天。对正式接口计数确认：记录提交后没有主动 describe/register/query，重新执行读取最新数据且无需重注册；结构变化会重新注册。Phone 使用期间全量 read 调用为 0，没有 Phone Worker/WASM 请求，没有页面错误或模型请求。Agent 路径直接提交隔离提案，未调用模型执行自动填表生成。

两个插件的生产产物通过各自 Junction 加载，验收后关闭预览与隔离 ST 服务；未修改用户聊天。未覆盖真实移动设备、其他浏览器和语义检索。
