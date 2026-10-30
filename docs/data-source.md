# 手机公共资料与数据库

手机通过 Memory 公开只读 API 取得当前对话的资料快照，资料 App 展示人物、纪要和物品，Fake DBeaver 查询 Phone 自有的内存 SQLite。两个 App 共用一次来源读取与缓存。联系人备注、好友关系、消息和日记属于手机业务数据，本轮尚未实现其保存。

## 契约与归属

`src/features/background/background.ts` 定义 `CharacterProfile`（id/name/profileText）、`Chronicle`（id/title/content）、`ItemProfile`（id/name/description）与 `PhoneBackground`。同一份 `PhoneBackground` 携带结构化数据库快照及独立的展示映射错误。人物描述包含来源当前提供的身份、性格、经历和近况，不承诺信息完整或角色知情。

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
├── features/database/
│   ├── index.ts                       # 数据库功能公开入口
│   ├── database.ts                    # schema v1、SQL 值与引擎契约
│   └── database-service.ts            # 导入、聊天归属和内存编辑会话
├── infrastructure/ste-memory/
│   ├── memory-background-provider.ts # 连接 Memory 并转发变更通知
│   ├── public-read-contract.ts        # 外部协议类型，仅适配器内部使用
│   ├── map-background.ts              # 剧情记忆预设到手机资料的转换
│   ├── map-background.test.ts         # 结构校验与文本转换验证
│   └── map-database.ts                # 完整源表与手机标准视图映射
├── infrastructure/sqlite/
│   ├── worker-client.ts               # 首次使用时启动 Worker，结算请求
│   ├── database-worker.ts             # WASM 初始化和串行执行队列
│   ├── engine.ts                      # 原子建库、原生授权与查询预算
│   ├── engine.test.ts                 # 真实 SQLite WASM 行为验证
│   └── database-service.test.ts       # 缓存、失败恢复及聊天切换验证
└── frontend/index.ts                  # 组装来源、共享数据源与手机
```

了解手机需要什么资料时先读 `background.ts`；了解读取和缓存行为时读 `data-source.ts`；修改 Memory 接入时再读 `infrastructure/ste-memory`。核心不依赖 ST、浏览器全局或具体适配器；预览与生产通过不同来源实现同一个读取约定。App 与适配器均从 `features/background/index.ts` 使用功能，ESLint 检查依赖方向。

读取流程在 `load` 中按“核对绑定、复用请求或缓存、发起读取”组织，异步结果在 `readAndPublish` 中完成归属检查、固定快照和状态发布。变更版本同时覆盖聊天切换和同聊天内更新；旧请求的结果、错误与清理不能影响新请求。

## Memory 接入

链路为 `STE_MEMORY_API v1 → MemoryBackgroundProvider → mapMemoryBackground → BackgroundDataSource → App`。不导入相邻源码，不打开 Memory 数据库，也不依赖调试 runtime。

Memory 的正式只读 API 与完整契约见其 `docs/public-read-api.md`。一次 Worker 调用取得已提交空间、表、字段和全部记录，不含历史、证据、任务、设置或密钥。该 API 未提供 SQL 或 semantic 查询，本轮只使用现有快照与订阅，不修改 Memory。读取前后核对聊天身份、空间及变更代次。绑定变化和 SQLite 已提交资料发布通过订阅通知，即使随后持久化失败也会失效；未提交填表数据不可见。SQL 控制台的未保存直接操作不属于公共数据源的更新保证。

资料展示明确适配「剧情记忆」预设的 `characters`、`chronicle`、`items`，校验启用的表、名称和主要内容字段及类型；缺表或结构不符时资料 App 显示具体错误。数据库仍导入公开源结构，以便查询自定义表和不兼容字段；展示失败在 `phone_capabilities.background_display` 中标记为 `error`。支持空表，来源读取没有页数上限，不截断记录。

所有启用字段按字段位置拼接为带标签的文本，引用按同一快照中的当前显示策略展开为名称，不调用模型做摘要。人物同名允许共存，名称不参与身份匹配。纪要按记录创建时间升序、ID 升序排列，此顺序不表示剧情时间。

## Phone 只读资料投影

Phone 拥有标准查询契约和 SQLite 引擎，Memory 适配器处理源字段含义及结构差异。`DatabaseSnapshot.schemaVersion` 当前为 `1`；数据库名称使用来源空间显示名，身份使用 `sourceId/scopeId`，改名不改变身份。SQLite 在独立 Worker 中运行，只在第一次导入或查询时加载 WASM，采用 `:memory:`，刷新页面后可从来源重建。

每次成功读取都建立候选数据库，完整导入并预编译视图成功后一次替换旧库；建库失败保留同聊天、同范围的旧库并明确标记过期。切换聊天立即清空当前投影展示，旧异步结果无法发布到新聊天或切回后的新代次。来源提交、通知、快照读取和本地导入之间存在时间差，查询提供最近成功快照的弱一致性；查询执行期间不会混入另一份快照。

所有公开源表按 `src_<原始表 key>` 命名，列名保留原始字段 key，包含停用表、停用字段和完整公开记录。整数和布尔值导入 INTEGER，小数导入 REAL，其余导入 TEXT；布尔值使用 0/1，多值字段使用 JSON 数组。引用保留记录 ID，结构说明提供引用目标；可通过 `json_each` 展开多值。表还包含 `_phone_source_id`、`_phone_scope_id`、`_phone_record_id`、创建/更新时间、显示文本、完整 payload JSON 和公开 record JSON。`_phone_` 为保留前缀，空名、NUL 和忽略 ASCII 大小写后的对象/列名碰撞会报错。

标准对象固定保留以下结构：

| 对象                                                               | 用途与主要列                                                                                                    |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `phone_characters`                                                 | 人物视图：`source_id/scope_id/record_id`、`name`、`profile_text`、`personality`、`background`、`current_status` |
| `phone_chronicles`                                                 | 纪要视图：身份、`title`、`content`、`start_time`、`end_time`、`related_character_ids`、`profile_text`           |
| `phone_items`                                                      | 物品视图：身份、`name`、`description`、`owner_id`、`status`、`profile_text`                                     |
| `phone_world_state`                                                | 世界状态视图：身份、`name`、`world_time`、`current_location`、`weather`、`clothing`、`other_scenes`             |
| `phone_chronicle_characters`                                       | 纪要人物关联：`source_id/scope_id/chronicle_id/character_id`                                                    |
| `phone_source_space`、`phone_source_tables`、`phone_source_fields` | 公开来源定义、原始 key、字段类型、引用目标及完整定义 JSON                                                       |
| `phone_capabilities`                                               | 标准映射的 `object_name/status/detail`，区分 `supported` 零记录、`unsupported` 空视图和展示 `error`             |

标准视图所需的主要字段缺失、停用或类型不符时，保留具有固定列的空视图，并公开 `unsupported` 原因；可选字段不兼容时返回 NULL，列说明标记原因。世界状态要求启用的 `story_state.name` 和 datetime 类型的 `current_time`。标准列用 `world_time` 避开 SQLite 的 `CURRENT_TIME` 内置关键字；直接查询源列时使用双引号引用，日期完全取自来源，不使用设备时间或记录创建时间补齐。

```sql
SELECT date(world_time) AS world_date, current_location FROM phone_world_state;
SELECT date("current_time") FROM src_story_state;

SELECT c.name, m.title, m.start_time
FROM phone_chronicle_characters AS link
JOIN phone_characters AS c
  ON c.source_id = link.source_id AND c.scope_id = link.scope_id
  AND c.record_id = link.character_id
JOIN phone_chronicles AS m
  ON m.source_id = link.source_id AND m.scope_id = link.scope_id
  AND m.record_id = link.chronicle_id;
```

`PhoneDatabaseService.query(sql, params?)` 支持 `:name` 命名绑定，缺少参数、多余参数和位置参数均报错。每次只允许一条返回结果的只读语句，由 SQLite 原生授权控制表/列读取和函数调用；拒绝写入、DDL、PRAGMA、ATTACH、内部 schema 及危险函数。默认 750 ms 执行预算、200 行上限，超出行数明确显示截断；单值/SQL 长度及结果总量也有限制，结果超过 2 MB 会报错。拒绝或超时后可继续执行正常查询，Blob 需转换为文本或 `hex()`。

数据库 App 的 SQL 草稿、最近结果、错误、对象选择、搜索和内容滚动位置按聊天与范围保留在插件内存，Home 退出和关闭手机后重进恢复，页面刷新清空。已保留结果代表上次执行，资料刷新后需重新执行。当前无业务写入、日记、设置或聊天持久化；未来手机业务数据应由 Phone 独立拥有并按聊天保存，semantic 查询留待来源契约明确后接入，禁止借用 Memory 内部 runtime 或数据库。

## 资料 App 与预览

主屏「资料」提供来源概览、人物/纪要/物品列表、名称与正文搜索、完整详情和复制正文。只读，不保存新业务数据。重进恢复概览，公共缓存仍可复用；聊天切换重置页面。

运行 `pnpm preview:frontend`，使用 `/?data-source=1` 直接进入资料 App。可加入 `data-state=empty`、`error`、`unavailable` 验证对应状态；可与 `responsive=1` 组合。预览使用 `docs/ui/data-source-fixture.ts`，不访问 ST。

数据库使用 `/?database=1` 快捷入口，包含源表、标准视图、世界状态与自定义字段示例，复用相同状态参数。构建、watch、预览、同步和发布均包含同目录的 `database-worker.js` 与 `sqlite3.wasm`。

工程检查覆盖缓存共享、刷新失败、同空间聊天切换、读取途中失效、同名及改名引用、完整记录数、空表与结构错误。真实 ST 验收关注两个插件加载次序、Memory 更新通知、聊天绑定变化和宿主样式隔离。

## 资料接入验收记录（2026-10-30，数据库接入前）

手机类型检查、Lint、格式、构建及 12 项测试通过；Memory 相关 6 个测试文件共 117 项通过，覆盖运行时接线、正式读取边界、SQLite 快照隔离、提交后缓存失败通知和运行库重载。

Edge 无头浏览器通过概览、三类资料、正文搜索、详情、复制、返回、跨 App 导航、空态/错误态/未连接状态，以及 320px、390px 和可选全屏布局。真实 ST 使用独立 dataRoot，验证正式接口读取、人物改名与引用自动更新、纪要删除、两个聊天间切换和切回恢复；无 pageerror，无模型生成请求。未修改用户聊天。两个扩展目录均确认通过 Junction 指向对应仓库的 dist。

未覆盖真实手机、其他浏览器及用户自定义表格映射；跨插件加载顺序由接口已有检测与 ready 通知处理，未穷举所有扩展启动组合。

## 数据库工程检查（2026-10-30）

串行执行类型检查、Lint、格式检查、21 项测试和生产构建通过。测试使用真实 SQLite WASM，覆盖完整源结构及 JSON、字段类型、标准世界时间与源关键字引用、纪要人物 JOIN、自定义结构能力说明、只读授权、命名绑定、行数截断、执行超时后恢复和候选库失败时保留旧库；服务测试覆盖共享读取、刷新失败恢复和 A→B→A 查询归属。发布与同步测试在隔离临时仓库验证包含 Worker/WASM 的产物集合。

Edge 浏览器通过对象与列说明、源表、标准视图、关联 JOIN、结果复制入口、写入/PRAGMA/多语句/内部表拒绝、200 行截断、超时恢复、对象详情返回恢复列表滚动、Home 与关闭后恢复 SQL 和结果。1280px、320px、390px 机身与页面布局通过；普通资料浏览不启动 SQLite，进入数据库后 Worker/WASM 正常加载。原有资料 App 的搜索、详情、复制、空态、错误态、未连接状态及可选全屏回归通过，无 pageerror。

真实 ST 使用隔离 dataRoot 验证正式 Memory 快照导入、纪要人物 JOIN、世界日期、只读刷新不产生 Memory 修订、人物改名后的缓存重建、聊天切换与草稿隔离，以及关闭期间切换聊天后重新打开。最终全流程无 pageerror、无模型请求，未修改用户聊天；构建产物已确认通过 Junction 加载。预览和隔离 ST 服务在验收后关闭。未覆盖真实手机、其他浏览器、语义检索和手机业务数据持久化。
