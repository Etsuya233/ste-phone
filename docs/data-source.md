# 手机公共资料与数据库

Phone 定义标准查询结构，Memory 执行 SQL 并提供当前已提交资料。资料 App 和 Fake DBeaver 共用 `PhoneDatabaseService`，Phone 只持有来源结构、视图 SELECT、查询结果与页面会话。生产插件不加载 SQLite/WASM，不调用 `STE_MEMORY_API.read()`，也不复制完整 records。

## 契约与归属

Memory 保留公开读取 v1 的 `getContext/subscribe/read`，Phone 要求额外的 `database.version === 1` capability：`describe` 返回空间、启用表/字段、公开列名、`schemaKey` 与数据库加载生命周期 `databaseKey`，不含 records；`registerViews` 在 `ste_phone` namespace 原子注册整组视图；`query` 接受当前聊天、空间、结构身份、SQL、命名参数及执行预算。Phone 只定义外部协议类型，不导入相邻仓库源码，不访问 Memory 内部实体表、调试 runtime 或历史。

`sourceId/scopeId/record_id` 标识来源资料；聊天身份独立参与请求归属和编辑会话隔离，即使两个聊天共享同一空间也不能混用异步结果。空间名和人物名可变，身份保持稳定。查询反映执行时 Memory 当前 committed 数据，未提交内容不可见；多次查询和资料分页允许弱一致性，不建立历史快照会话。

首次使用或收到来源更新后的下一次操作先 `describe`。结构身份与数据库加载生命周期均未变时沿用已注册视图；结构改变、空间卸载后重进或同聊天重新加载数据库时重新注册。Memory 负责在每次数据 publish 重建数据库后恢复已注册 namespace 视图。普通记录变更只标记现有结果与资料缓存过期，不读取全部数据、不自动重查、不重建 Phone 数据库。重新查询自然读取最新 committed 数据。结构检查或查询失败显示具体错误，同聊天旧结果保留并标过期。

## 代码位置

`features/database/database.ts` 定义结构、结果及 `DatabaseProvider`，`database-service.ts` 管理来源变化、请求去重、聊天归属与编辑会话。`infrastructure/ste-memory/memory-database-provider.ts` 对接正式 capability，`map-database.ts` 根据公开结构生成 SELECT，`memory-background-provider.ts` 分页查询标准视图供 `BackgroundDataSource` 缓存。入口组装单例，两个 App 共享服务。

`PhoneBackground` 只保存展示实际需要的人物、纪要与物品。资料读取每页 200 行，按创建时间和记录 ID 排序，读取到最后一页；单页意外截断会明确失败。它不读取自定义表 records，不以 200 行静默截断完整资料。来源通知只使缓存过期，用户刷新或下一次 `load` 时读取。来源更新期间完成的旧读取不能覆盖新状态。

## 源别名与标准视图

所有 `src_<table.key>` 都是 Memory 公开业务表的别名 VIEW。字段 key 保持原样，布尔值使用 0/1，多值使用 JSON 数组，引用使用记录 ID。对象说明包含原始字段 ID、类型及引用目标。源别名提供 `_phone_source_id`、`_phone_scope_id`、`_phone_record_id`、`_phone_created_at`、`_phone_updated_at`、`_phone_display_text`，从公开系统列 `$record_id/$display_text/$created_at/$updated_at` 取得值。停用表/字段不在公开 SQL 结构内。

| 标准对象                     | 主要内容                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `phone_characters`           | 身份、`name/profile_text/personality/background/current_status`              |
| `phone_chronicles`           | 身份、`title/content/start_time/end_time/related_character_ids/profile_text` |
| `phone_items`                | 身份、`name/description/owner_id/status/profile_text`                        |
| `phone_world_state`          | 身份、`name/world_time/current_location/weather/clothing/other_scenes`       |
| `phone_chronicle_characters` | `source_id/scope_id/chronicle_id/character_id`，用 json_each 展开完整关系    |
| `phone_capabilities`         | `object_name/status/detail`，明确报告 supported 或 unsupported 及原因        |

身份列包含 `source_id/scope_id/record_id/created_at`。各标准视图要求所声明来源字段启用、类型及引用目标兼容；无法映射时不注册该标准视图，在 `phone_capabilities` 说明原因，公开源别名仍可查询。支持的空表正常返回零行。资料展示依赖三类标准视图，任一不可用时显示具体映射错误。

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

`PhoneDatabaseService.query(sql, params?)` 转发给 Memory，命名绑定使用 `:name`。Memory 执行单条只读 SQL，默认 200 行、750 ms，返回 `columns/rows/elapsedMs/truncated/maxRows`；截断和失败由页面明确显示。只允许公开业务表及当前 namespace 的视图，写入、内部 schema、危险函数、PRAGMA 和多语句由 Memory 拒绝，超时后可继续查询。

SQL 草稿、结果、错误、对象选择、搜索和滚动位置按聊天与范围保留在插件内存，退出 App 或关闭手机后恢复，刷新 ST 清空。来源更新后结果显示过期，检查视图结构不将旧结果伪装成新结果，重新执行后更新。联系人备注、好友关系、消息和日记属于 Phone 独立拥有的业务数据，后续按聊天保存；semantic 接入后置。

## 预览与验收

独立预览 `/?database=1`、`/?data-source=1` 复用生产页面及适配器，`data-state=empty/error/unavailable/unsupported` 检查对应状态。`docs/ui/data-source-fixture.ts` 提供独立 Fake Memory capability，`preview-sqlite.ts` 仅用于预览真实 SQL，SQLite 包属于 devDependency，WASM 仅复制到预览输出目录。生产只发布 `index.js/style.css/manifest.json`。build、watch、sync 和 release 会清理受管理的旧 Worker/WASM，保留用户其他文件。

工程检查应串行执行类型、Lint、格式、测试与构建。测试用 Node 内置 SQLite 验证生成视图、当前引用名称、关联和日期，服务测试覆盖数据通知不复制、不调用 read、结构变更重新注册、完整分页、聊天异步归属与旧结果过期。真实 Memory 的只读授权、执行预算与 publish 生命周期由 Memory 测试验证。预览和真实 ST 的操作验收需另行记录，旧本地投影方案的历史验收不能作为新链路的通过证据。

### 本轮验收（2026-10-30）

Phone 类型、Lint、格式、19 项串行测试及生产构建通过；聊天切换加载修复后再次通过类型检查与构建。Memory 相关 81 项测试通过，包含真实 WASM 的只读查询、视图发布生命周期、结构变更、运行库重载与公开绑定检查；数据库加载标识兼容调整后，5 项数据库测试及构建再次通过。

Edge 预览通过对象/列说明、源别名、标准视图、关联查询、只读拒绝、截断、超时恢复、对象返回滚动恢复、Home/关闭后恢复草稿和结果，以及 1280px、320px、390px 布局。资料 App 的搜索、详情、复制、空态、失败、未连接和可选全屏回归通过，无页面错误。预览使用的 WASM 不进入生产构建。

隔离 ST 验收通过人物/纪要 JOIN、世界日期、只读刷新、手动记录更新、Agent 提交链路、字段显示标签变更、聊天切换与切回，以及关闭期间切换聊天。对正式接口计数确认：记录提交后没有主动 describe/register/query，重新执行读取最新数据且无需重注册；结构变化会重新注册。Phone 使用期间全量 read 调用为 0，没有 Phone Worker/WASM 请求，没有页面错误或模型请求。Agent 路径直接提交隔离提案，未调用模型执行自动填表生成。

两个插件的生产产物通过各自 Junction 加载，验收后关闭预览与隔离 ST 服务；未修改用户聊天。未覆盖真实移动设备、其他浏览器和语义检索。
