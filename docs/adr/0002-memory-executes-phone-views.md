# Phone 标准视图由 Memory committed 数据库执行

状态：接受，取代 [0001](0001-phone-owned-readonly-projection.md)。

Phone 自有内存 SQLite 会复制完整公开 records，刷新还会同时保留旧库与候选库。Memory 已拥有已提交数据库并提供公开 SQL capability，重复导入增加了内存、执行链路和更新状态的复杂度。

Phone 保留版本化的 `phone_*` 标准查询结构，由 Memory 适配器根据 `describe` 返回的公开表和字段生成 `src_*` 别名 VIEW 及标准 VIEW，注册到 `ste_phone` namespace。Memory 原子验证整组视图，普通 query 在当前 committed 数据库执行；每次数据 publish 重建数据库时，Memory 恢复已注册且结构兼容的视图。Phone 不访问内部实体表，不调用公开 read 复制全部 records，生产不携带 SQLite Worker/WASM。

记录更新只使结果过期，下次查询检查结构并自然读取当前资料；结构身份变化后重新注册。资料 App 同样查询标准视图，按 200 行分页读取实际需要的三类资料，避免留下全量快照读取路径。多次查询允许弱一致性，不增加历史快照 session。聊天与范围共同确定归属，切换后丢弃旧异步响应，编辑会话按聊天保留。

不支持的标准映射在 `phone_capabilities` 公开原因，对应视图不创建，不用空视图或 NULL 字段掩盖结构问题。源别名仅暴露公开启用字段与公开系统列；旧 payload/record JSON 和全元数据副本列不再提供。Phone 仍独立拥有未来联系人、消息、日记等业务数据，按聊天保存；semantic 留待正式来源契约。
