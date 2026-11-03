# 微信记忆屏障与历史消息条数配置实现思路

状态：GPT-6.1 Sol 已完成实施，主代理完成审查与验收。基于 2026-11-03 当前源码核对，规则以 [需求文档](spec.md) 为准。

## 现有入口

| 位置                                           | 当前职责与计划改动                                       |
| ---------------------------------------------- | -------------------------------------------------------- |
| `src/apps/wechat/wechat.ts:19`                 | 会话与待回复模型；增加屏障记录定义和可选字段             |
| `src/apps/wechat/wechat.ts:66`                 | `pendingWechatMessages` 已表达待回复归属，保留其业务规则 |
| `src/apps/wechat/wechat-prompt.ts:22`          | 构造AI输入；改用允许消息序列，分别表达历史与本轮输入     |
| `src/apps/wechat/wechat-prompt.ts:69`          | 时间语境计算；只接收获准序列，避免读取被屏蔽消息         |
| `src/apps/wechat/wechat-context.ts:31`         | 获取剧情与ST资料；维持现有背景范围                       |
| `src/apps/wechat/wechat-service.ts:237`        | 回复启动入口；统一检查写入互斥与屏障数据合法性           |
| `src/apps/wechat/wechat-service.ts:284`        | 持久化与快照发布；复用固定目标保存，增加屏障写入归属检查 |
| `src/apps/wechat/wechat-reply-session.ts:35`   | 固定本轮会话；保持原生成与停止生命周期                   |
| `src/apps/wechat/ui/wechat-chat.tsx:11`        | 聊天顶栏、操作入口、错误与服务状态接线                   |
| `src/apps/wechat/ui/wechat-messages.tsx:28`    | 消息流；合并渲染边界分隔条，提供消息操作菜单             |
| `src/apps/wechat/ui/wechat-home.tsx:38`        | 列表排序与摘要依赖末条消息；排除仅含屏障的零消息会话     |
| `src/infrastructure/host/wechat-storage.ts:14` | ST元数据保存与回滚；沿用当前端口，不创建新存储通道       |
| `docs/ui/preview-wechat-storage.ts:5`          | 独立预览存储；同样保存新字段，增加可重复验收样例         |

行号是最初讨论时的源码位置，后续实施或其他并行改动可能变化，应以方法名定位。历史条数配置的新增接线详见后文。

## 模型与规则集中位置

在 `WechatConversation` 添加 `memoryBarriers?: readonly WechatMemoryBarrier[]`：

```ts
interface WechatMemoryBarrier {
  readonly id: string;
  readonly afterMessageId: string | null;
  readonly enabled: boolean;
}
```

`afterMessageId: null` 表示首条前，其余表示紧接指定消息后。屏障数组不承担时间线排序，查消息位置推导边界。新消息追加时无需改写屏障。缺失字段是明确的 v1 兼容约定，不能把损坏记录当作无屏障。

新增 `src/apps/wechat/wechat-memory.ts`，集中边界校验、生效屏障选择与本轮可见消息计算。它承担完整的消息读取规则，页面与提示词不各自实现一套筛选。它可返回供页面使用的边界状态及供提示词使用的允许序列；不引入策略注册、通用过滤框架或多层薄包装。

领域词汇已经记录在根目录 `CONTEXT.md`。本次沿用现有模块所有权和存储，暂不增加 ADR；消息边界与界面规则记录在本功能需求内即可。

## 消息选择主流程

1. 使用完整单聊和发言人物取得并固定原待回复集合 Q。
2. 校验所有屏障，按消息原序找最新开启边界；首条前边界位置为0，无屏障时同样为0。
3. 按边界截取消息后缀得到 eligible；Q与eligible取交集为本轮输入P，绝不能把屏障前的待回复重新合并进来。
4. 在 eligible 上找首条 P 的位置 start；无 P 时 start 为 eligible.length。本轮开始时固定设置值N，窗口起点为 `min(start, max(0, eligible.length - N))`。
5. 窗口中属于 P 的消息归入“本轮输入”，其他归入“当前微信历史”。两段均保留消息 ID 与原始顺序信息，提示词明确本轮输入是回复目标。
6. 时间语境只使用 eligible，窗口首条的前一条也从 eligible 读取。首条eligible没有前一条，不得从完整数组补取屏障前时间。当前设备时间继续提供。

无屏障时eligible等于原消息序列，P等于Q；窗口计算结构沿用现有规则，将固定30替换为配置N，默认100。屏障对历史及待回复同时生效，所有模型输入只来自后缀。

`wechat-prompt.ts` 负责协议字段和提示词说明，`wechat-memory.ts` 负责业务筛选。当前 `wechat-reply.ts` 以原待回复最后一条记录 `triggerMessageId`，`wechat-reply-session.ts` 成功后删除显式待回复边界；实施时必须区分实际回复P与原批次Q的消费位置。被屏障跳过的旧消息不能冒充回复触发消息，也不能在删除显式边界后通过旧记录推断重新进入队列。需要明确记录每个人物原Q的已处理截止位置（包含用户选择跳过的部分），成功时与回复同事务保存；旧数据继续按原规则读取，遇到新截止记录时优先采用。失败与停止不能推进此位置。无P时生成主动回复，不写虚假的触发消息。

建议会话增加可选 `pendingCompletedThrough: Readonly<Record<string, string>>`，按发言人物保存原Q末条消息ID；缺省沿用旧数据推断。显式待回复起点优先于完成位置，完成位置优先于旧回复触发ID回推，三者职责分别为当前批次、处理截止和旧格式兼容。

这一新增消费位置只表达“队列已结束到哪里”，不保存可推导的P副本。关闭屏障恢复旧历史资格，已结束的队列不会重新成为新输入。

## 历史条数设置与请求接线

全局配置继续由设置模块拥有。在 `src/apps/settings/ports/settings-storage.ts` 将PhoneSettings升级为v6，新增 `wechatHistoryMessageLimit: number`；`settings-service.ts` 负责默认100、旧版本迁移、正安全整数校验及保存，保留壁纸、模型连接、布局与发送模式。生产和预览共用迁移，宿主与预览存储的版本识别同步支持v6，不能只改TypeScript声明。

在 `src/apps/settings/public.ts` 扩展微信公开偏好，提供条数读取与显式保存。现有 `WechatPreferences.getSnapshot()` 返回发送模式字符串，避免为了新字段破坏已有发送模式消费者；可新增历史条数读取及设置方法，沿用现有subscribe。条数只有全局配置一个权威来源，聊天会话不复制保存。

在微信“我”增加“设置”入口，`wechat-page.tsx` 增加独立settings路由，`wechat-app.tsx` 接线，新增 `ui/wechat-settings.tsx` 展示数字输入、说明、保存和错误。页面只持有未保存草稿，不直接读写ST或localStorage，保存调用设置公开接口。复用既有Foundation控件、返回舍弃与页面保活约定；保留当前发送模式入口。

`WechatService.requestReply` 启动回复时从偏好读取N，作为明确输入交给 `WechatReplySession` → `createWechatReplies` → `readWechatPrompt` → `buildWechatPrompt`。必须在背景异步读取之前固定，禁止在请求后半段重新读设置。测试构造提示词时显式给N，生产默认值只由设置模块提供，避免多个入口各自兜底100。

筛选模块接收固定N，先按屏障产生eligible，再执行窗口公式。配置文案称为历史消息条数，计数仍沿用窗口内全部消息条目的规则，P完整保留是明示例外。改变N不改变队列完成位置或屏障锚点，关闭屏障也不取消条数限制。

## 服务写入与页面

在 `WechatService` 增加插入、开关、删除三个明确业务操作，内部按“检查归属及互斥 → 校验边界 → 形成下一会话 → 固定保存目标 → 保存 → 发布结果”组织。修改操作共用一次实际存储事务，保存失败不发布新状态。

扩展当前写入状态表达屏障保存，显式保存操作目标与归属代次；页面直接消费这一状态，不通过历史值比较猜阶段。屏障保存锁与现有发送/回复锁互斥，帐号切换也须尊重该锁。切聊天只切换界面归属，不能提前释放尚未完成的保存锁。

沿用宿主存储先捕获目标与序列化快照再 await 的规则。保存完成后须同时核对聊天身份与发起时的归属代次；同ID聊天切走再返回也属于新载入，旧回调不得直接发布捕获快照。若原保存已经成功且当前回到同一目标，应在全局写入互斥仍持有时从存储重新读取确认后的数据，再同步当前会话，保留当前帐号和草稿；避免当前会话基于提前载入的旧数据覆盖刚落库内容。宿主适配器仅将最新确认的同目标微信字段合并到当前元数据，不覆盖当前其他插件字段，并由写入序号阻止更旧确认回放。失败反馈携带旧目标，和当前聊天回复错误分开表达。避免为此改造日记或新增跨App调度器。

`WechatChat` 负责菜单与服务操作接线；分隔条可独立为 `WechatMemoryBarrier` 展示组件，消息操作菜单与边界渲染留在消息流附近。复用 Foundation `ActionSheet` 和受控 `Switch`，样式写入微信目录并遵循 Shadow DOM 限定。资料保持可达。

滚动控制需识别明确的插入目标，普通开关、删除保留阅读位置；不能只把屏障数量加入现有“靠底跟随”依赖，否则在旧消息中插入可能跳到底。新增组件和服务职责按项目阈值复查，避免继续将所有行为堆入已有服务或聊天组件。

`wechat-home.tsx` 当前排序和摘要都假定存在末条消息，需要在会话列表入口显式排除零消息会话；只含屏障的会话仍可从通讯录进入，不能伪造最后消息时间。检查 `rollbackWechatMessage` 中“消息数为0即删除会话”的逻辑：带屏障的空会话必须保留，否则首次发送失败会误删屏障。回滚仍只撤回失败消息与其待回复变化。

## 实施与验证顺序

先实现全局设置v6迁移及默认100，再实现模型、校验与允许序列，覆盖多屏障、Q/P边界、跳过旧队列、可配置窗口与时间隔离；再接入服务保存、失败恢复及归属检查；最后完成菜单、分隔条与独立预览样例。测试应断言关键业务结果，避免为每个薄操作写镜像测试。

扩展 `settings-service.test.ts` 验证旧配置迁移、默认100、显式保存及非法条数；扩展 `wechat-context.test.ts` 验证N=30/100/200的最终提示词和窗口，扩展 `wechat-service.test.ts` 验证互斥、空会话保留、保存失败及聊天切换；必要的边界组合集中在新增规则测试内。现有宿主存储协议未变化时复用其集成测试，只有改动宿主发布逻辑时补充对应回归。

实施后按项目约定串行执行 `pnpm typecheck`、`pnpm lint`、`pnpm format:check`、`pnpm test`、`pnpm build`，再做独立预览与专用 ST 聊天验收。交付须区分已运行检查和未验证范围。

## 实施结果

实现由 GPT-6.1 Sol 完成，主代理审查核心筛选、队列完成截止、保存互斥与聊天重载接缝，并完成独立验收。本轮未发版或部署到用户真实ST。

现行维护入口：`wechat-memory.ts:44` 集中最新屏障、允许后缀和N窗口；`wechat.ts:79` 维护待回复及完成截止；`wechat-memory-editor.ts:11` 拥有屏障先保存后生效；`wechat-writes.ts:30` 拥有串行保存与重载后权威数据重读。`settings-service.ts:102` 公开历史条数偏好、默认100及版本迁移，`ui/wechat-settings.tsx:9` 为设置页面，`ui/wechat-memory-menu.tsx:7` 为操作菜单。此前表格保留初始源码位置，当前以这些入口和方法名为准。

Sol串行完成typecheck、lint、format:check和生产build；主代理最终运行全量179项测试全部通过，git diff --check通过。独立预览覆盖320px、390px和桌面，捕获实际模拟传输载荷核验屏障方向、N=30/100/200、P跨界与超窗、时间隔离；另验证多屏障、固定锚点、空会话、失败保存、重试、关闭后队列不复活、焦点与滚动。结构整理后定向复验通过。

在独立ST1.18.0数据目录通过生产存储适配器与真实单聊、群聊及设置保存接口，重读屏障、队列完成位置与v6设置，并验证ST正文、日记及其他插件字段保留。未做真实ST手机UI端到端、真实模型或移动真机验收。完整前端说明在 `docs/ui/frontend-preview.md`。

生产文件均不超过350行，React组件均不超过120行。三处普通函数超限继续保留：`generateAndSave` 74行集中生成、完成截止与取消保存；`WechatSubmission.append` 77行集中乐观展示、原归属草稿恢复与失败撤回；`useWechatMemory` 94行集中异步编辑后的滚动及前台焦点生命周期。已检查职责，继续拆分会分散同一任务的状态与清理。
