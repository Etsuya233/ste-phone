# 壁纸图库使用 ST 原生账号图片目录

状态：接受，取代 [0003](0003-retained-app-navigation-and-settings.md) 中的旧壁纸来源与预览存储方案。

用户选择仅保留默认渐变和 Phone 上传壁纸。图库使用三列 9:16 竖向缩略图，不显示文件名、说明或成功提示；选择缩略图进入全幅预览，上传成功直接进入新图预览。Blur 与「设定」在预览页，设定保存后返回图库，失败可见。

生产通过 ST 原生 `POST /api/images/upload` 与 `POST /api/images/list`，固定单层目录 `ste-phone-wallpapers`。ST 认证上下文决定账号，文件保存于 `data/<账号>/user/images/ste-phone-wallpapers/`，静态 URL 为 `/user/images/ste-phone-wallpapers/<文件>`。上传请求不接受用户路径或原文件名，前端以 getRandomValues 生成唯一文件名，使用 PNG/JPEG/WebP 白名单、10 MB 限额和浏览器解码验证。图片由宿主保存，Phone 配置只拥有当前选择和 Blur。

设置 schema v2 保存壁纸路径与 Blur。读取 v1 时显式移除旧 URL 列表与旧背景选择，迁移到默认渐变并保留 Blur，立即交给对应存储保存。未知版本直接报错。v2 继续使用 ST extensionSettings 与 saveSettingsDebounced；设置操作不声称已收到服务端持久化确认。

独立预览使用 IndexedDB 保存 Blob 与自增 ID，localStorage 仅保存稳定 ID 和配置。入口启动时重新生成会话 object URL，避免刷新后引用已失效地址。URL 随整个手机会话存活，页面真正卸载时回收；BFCache 暂存保留它们。局域网 HTTP 无需 randomUUID 或安全上下文，预览不调用生产图片接口。
