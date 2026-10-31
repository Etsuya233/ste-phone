# 基础 AI 与模型连接方案

2026-10-31。状态：用户已确认方案，待实现；本轮只进行源码调研、主代理与 Sol Medium 的逐轮问答及文档整理，未修改运行代码、安装依赖或发送模型请求。

## 目标与范围

Phone 引入 Pi Agent 基础运行能力，在「设置 → 模型连接」管理命名连接并选择默认连接。首期支持 OpenAI Chat Completions 兼容服务、每连接自定义请求头和一次真实生成测试。测试经过 Pi Agent 与生产代理链路，确保 AI 基础有实际入口可验收。

按 ST 插件的规模设计：连接跨聊天，运行保持内存状态，设置使用宿主延迟保存。不加入分布式协调、持久任务、自动重试、自动切换服务、Memory 设置共享、业务自动生成或会话历史。首期模型名称手填，不要求服务实现 `/models`。

## 连接与设置

PhoneSettings 升至 v3，新增 `modelConnections` 数组与 `defaultModelConnectionId: string | null`。连接具有稳定 `id`、必填显示名 `name`、`baseUrl`、可空 `apiKey`、必填模型名称 `model` 和 `customHeaders`。已保存请求头使用键值对象；表单使用键值行，在转换前检测重复。显示名允许重复，引用以 ID 为准。

未保存设置使用 v3 初始值，连接数组为空、默认选择为 null。v2 迁移保留壁纸与 Blur；v1 先执行现有壁纸迁移，再补空连接/null。未知版本继续明确报错。生产保存到 `extensionSettings.ste_phone`，调用 `saveSettingsDebounced()`；独立预览使用自己的 localStorage，不读取真实 ST 配置。

列表展示连接名称、模型及默认标记，右上「+」进入添加页；点行编辑，提供删除和默认选择，并提供「无默认」。从空列表保存首个连接时自动设默认；已有连接时新增不改默认，即使当前选择为 null。删除默认连接后清空选择，其他连接保持。删除需明确确认；缺少默认连接时调用失败并提示先选择。

编辑页使用本地草稿，显式保存；测试成功不作为保存前提。返回时未保存修改需要确认舍弃；Home、Expose 预览和关闭手机依现有保活机制保留草稿。Expose 明确退出设置和刷新均结束内存草稿，不扩展全局退出协议。

PhoneSettingsService 提供保存连接、删除连接、选择默认及设置壁纸的语义操作，基于当前 state 更新。壁纸页目前提交 `{ version: 2, wallpaper, blur }`，必须一并改成仅提交壁纸字段，避免覆盖连接。服务更新内存并交给 ST 延迟保存，不宣称磁盘即时落盘，不另建一致性协议。

## 地址、鉴权与自定义请求头

Base URL 为上游基础地址，例如 `https://example.com/v1`；支持 http/https 和局域网 HTTP，保留路径前缀，移除首尾空白与末尾斜杠。拒绝带 userinfo、query、hash 的地址及完整 `/chat/completions` 地址，直接提示用户填写基础地址，不猜测修正。ST 在基础地址后拼接 `/chat/completions`。

API Key 可为空。缺少自定义 Authorization 时使用 `Bearer <API Key>`；自定义 Authorization 优先，允许空值。没有任何鉴权时显式传 `Authorization: ""`，防止继承宿主 Custom 源保存的密钥。请求头名称大小写不敏感，规范 Authorization 键名后只保留一个。

请求头名须符合 HTTP token 语法，不允许大小写不同的重复项；值保留原文，允许为空，禁止 CR/LF。Content-Type 固定为 application/json；Host、Content-Length、Connection、Transfer-Encoding 由代理/传输层决定，表单明确拒绝。校验属于输入契约，不静默丢弃或替换非法输入。

API Key 与请求头值默认隐藏，可切换显示。编辑页用一句说明告知其明文存于插件设置。日志不输出密钥、完整请求体或请求头；错误只呈现状态及经过凭据脱敏、长度限制的服务提示，不直接回显完整上游响应。

## 分层与宿主请求

`features/settings` 拥有连接配置与默认选择；`infrastructure/host` 集中实现 ST 的模型请求与 OpenAI SSE 到 Pi 流事件的转换。设置 App 消费注入的设置服务与测试能力，连接测试流程直接创建 Pi Agent 并使用该适配器。当前没有业务 AI 功能，共享运行能力等具体 App 出现生成需求后再确定。

生成使用 `POST /api/backends/chat-completions/generate`，请求体明确包含 `chat_completion_source: "custom"`、`custom_url` 和 `custom_include_headers`。后者为 JSON 对象文本，交由 ST 的对象读取器处理。浏览器到 ST 的请求头仅使用 `getContext().getRequestHeaders()`；用户定义的上游请求头只放进代理请求体。插件不写 ST secret store，不切换宿主模型或主连接。

生产仅依赖 Phone 自身已跟踪代码及包依赖；参考 Memory 的实现时按 Phone 范围重新整理，不引用相邻仓库或 tmp 文件。ST 代理是内部接口，其变更风险集中在适配器，通过真实 ST 验收识别。

## Pi 版本与首期运行能力

使用 `@earendil-works/pi-agent-core` 与 `@earendil-works/pi-ai`，两包均精确锁定 `0.83.0`，与调研时 Memory 的 pnpm-lock 一致。官方 main 已为 1.4.0，文档中的 TranscriptContext 与 Memory 所用 Context 有差异；本方案按 0.83.0 的类型与源码实现，不混用最新版示例。实施时先做当前 esbuild 浏览器构建验证，升级引擎单独处理。

首期只实现文本上下文和文本 SSE：system/user/assistant 的文本序列化、文本增量、完成、错误与取消。不开放业务工具，不实现工具调用或工具结果序列化；出现工具响应明确报不支持，不吞掉内容。App 直接使用 Pi 类型，日后实际工具需求出现时再扩展适配器并验证完整工具循环。

Pi Model 必填的 `contextWindow`、`maxTokens` 设为 0，明确代表未声明，符合该版 Agent 自身的初始元数据。此路径只使用自定义 streamFn，不启用自动裁剪、压缩或内置供应商推断；这些值不发送给上游、不显示为模型真实容量。实际输出限制由调用方显式给定，首期测试为 64。费用或 token 用量未知时不在 UI 显示成真实的零费用；不新增费用统计功能。

每次调用取得连接字段及请求头的独立副本，随后保存、切换默认或删除连接只影响下一次调用。测试针对当前草稿，可以在没有默认连接时执行；实际默认调用路径另行测试，确保默认选择真正被消费。

## 测试连接与生命周期

编辑页提供「测试连接」和运行中的「取消」。使用无聊天资料、无密钥内容的固定简短提示，创建 `tools: []` 的 Pi Agent，经过生产适配器请求；`stream: true`、`max_tokens: 64`，省略 temperature，不继承 ST 生成参数。按钮旁说明测试可能产生少量用量，保存不自动触发调用。60 秒总超时，失败不自动重试、不更换连接。

UI 显示测试中、取消、成功回复或简短错误。修改地址、API Key、模型或请求头立即取消并清除旧测试结果；改显示名不影响调用。页内返回取消测试，Home 与关闭手机保留运行和结果，Expose 明确退出设置时取消并销毁。控制使用 AbortController 和当前草稿代次，过期完成不回写新草稿。运行完成不在后台抢焦点或自动导航。

SSE 正常成功条件为非空文本、合法 `finish_reason: "stop"` 与后续 `[DONE]`。`length` 且有文本并收到 `[DONE]` 时显示「已连通，达到测试输出上限」。本期要求服务遵循这一完成协议；缺少标记、空回复、未知终止原因、工具响应或流内错误都明确失败，不用 EOF 猜测成功。收到 finish_reason 但没有 `[DONE]` 时继续受 60 秒总超时约束。HTTP 200 的错误对象同样识别为失败。

## 实施顺序与验收

1. 锁定依赖并验证浏览器构建；落地 v3 设置、迁移和语义更新，先消除壁纸整份提交风险。
2. 实现单一 ST Custom 代理适配器与文本流协议、连接配置副本及取消/超时，通过 Pi Agent 进行确定性测试。
3. 在现有 SettingsApp NavigationStack 添加连接列表与编辑页，复用 Foundation 和 token；独立预览注入可控 Fake AI，清楚标注模拟结果，不请求真实服务。
4. 串行执行 typecheck、lint、format:check、test、build；新增必要测试纳入当前显式 test glob，避免测试文件未执行。再完成窄屏与真实 ST 联调。

自动化必须覆盖 v1/v2 迁移、默认设置与删除、非法配置早失败、连接与壁纸互不覆盖；流协议覆盖 UTF-8 跨块、CRLF、多行 data、流内错误、200 错误体、空回复、length、缺失完成标记和超时取消。默认连接调用须消费实际所选配置，并验证请求开始后的设置变化不改变该次调用。工具响应在本期应失败。

UI 在 320px、390px 和桌面完成添加、保存、编辑、请求头行增删/隐藏、默认选择、删除、测试及舍弃草稿流程，验证 Home/关闭保留与 Expose 退出取消。真实 ST 使用隔离账号和本地 OpenAI 兼容测试服务，核验头值在服务端收到、空 Authorization 隔离宿主已有 Custom 密钥、两连接默认切换、取消、刷新恢复和 ST 主连接保持。真实用户付费服务由用户手动「测试连接」触发，开发联调不使用用户密钥。

本次方案调研未运行上述实现验收；实施后需单独报告实际通过范围。测试成功仅证明当前模型的文本生成，不宣称工具、图片或思考协议可用。

## 已完成的逐轮问答

参与者：主代理提问并给出建议，`gpt-6-sol` / `medium` 子代理回答与挑战，每轮只讨论一个主问题。用户审阅后确认方案，并要求移除提前规划的共享 AI 层；首期连接测试直接创建 Pi Agent。

### 第一轮：学习 Memory 的哪些部分，首期如何验收？

建议采用独立连接、应用层组装、Pi 原生类型和窄 ST 适配器。Sol 同意，指出 Memory 的 `/status` 测试只获取模型列表，无法证明生成成功；最终采用真实最小生成测试，且默认连接也须能驱动单轮 Agent。队列、提案、工具业务与历史持久化排除在首期产品范围外。

### 第二轮：默认连接与编辑如何定义？

建议 v3 连接数组与单一默认 ID、删除默认置空、显式保存草稿。Sol 删除了首次添加页的「设为默认」开关：从空列表添加首个连接自动设默认，之后由列表选择，保留无默认状态。确认设置服务必须按当前 state 的字段更新，防止壁纸保存覆盖连接；不引入 revision 或锁。

### 第三轮：请求头和 ST 代理的最小规则？

建议明确基础地址、显式 Authorization、JSON 序列化上游头并隔离宿主请求头。Sol 同意，建议仅追加少量传输头限制，避免泛化策略系统；不照搬 Memory 的静默完整地址修正、原始错误回显或仅模型列表测试。

### 第四轮：版本、工具范围与测试生命周期？

建议锁定 Memory 已验证版本，讨论是否提前支持工具循环。Sol 明确限定首期为真实 Pi Agent 的纯文本调用，拒绝为未来工具预建协议面；同意两包精确 0.83.0、容量元数据 0 代表未声明、测试显式 64 token 与 60 秒总超时。模型手填，修改请求字段取消过期测试，不自动重试。

### 第五轮：失败场景、完成条件与验收是否足够？

以断流、HTTP 200 错误、工具响应、stop 后悬挂、默认切换与草稿退出进行审查。Sol 建议明确非空文本 + stop/length + `[DONE]` 才成立；悬挂受总超时约束。确认不扩展 Expose 退出协议或 beforeunload：明确退出直接销毁草稿并取消。协议异常用确定性测试，真实 ST 只做必要代理与持久化联调；首期范围最终收敛为连接管理、默认选择和文本 Pi 调用。

## 调研依据

本地 Memory 源码在 `../ste-memory`，仅用于调研，Phone 运行不依赖该路径：README「聊天 API 连接」、ADR 0018、0024、st/0010，`features/settings/agent-connections.ts`、`infrastructure/sillytavern/llm/` 与 pnpm-lock 中的 0.83.0。Phone 依据 README、CONTEXT、ADR 0002/0003、前端规范和当前设置源码。

外部官方资料于 2026-10-31 核对：[Pi Agent 文档](https://github.com/badlogic/pi-mono/blob/main/packages/agent/README.md)、[Pi AI 文档](https://github.com/badlogic/pi-mono/blob/main/packages/ai/README.md)、[上游 Agent 包元数据](https://github.com/badlogic/pi-mono/blob/main/packages/agent/package.json)、[ST Chat Completions 后端](https://github.com/SillyTavern/SillyTavern/blob/release/src/endpoints/backends/chat-completions.js)。这些链接会继续变化；0.83.0 的运行契约以实施时锁定依赖的类型与源码为准，Memory 的包体积记录不作为 Phone 的构建测量结果。
