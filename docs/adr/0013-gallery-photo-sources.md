# 图库浏览与手机图库保存

状态：接受。补充 [应用公开接口](0006-app-owned-public-interfaces-and-core.md) 与 [应用数据迁移](0009-app-schema-migration-chains.md)。

图库提供统一浏览契约，固定两个来源。手机图库由图库维护，用户上传的照片没有绘图提示词和生成时间。Image Hub 继续拥有生成和保存，图库从 Hub 的公开接口读取记录。应用保存图库引用时保留来源、ID 和路径。壁纸仍使用自己的账号目录。

生产文件通过 ST 原生 `/api/images/upload` 保存到当前账号的 `user/images/ste-phone-photos/`，文件名由 Phone 生成。上传成功后通过 `/api/files/upload` 保存对应的 `user/files/ste-phone-photos-<id>.json`，每条索引独立记录版本、ID、路径和保存时间。逐图索引可以独立提交，两个页面上传不同照片时不会覆盖对方的记录。读取先列出图片，再批量调用 `/api/files/verify` 检查对应索引，最多同时读取八条索引。缺少索引的文件不展示，存在但损坏的索引会报告手机图库读取失败。

ST 在图片写入完成、索引原子写入完成后分别发送成功响应。Phone 收到两项确认后才增加完成数量。取消可中止浏览器当前文件请求，已提交的请求仍可能在 ST 保存文件。收到文件成功响应后继续提交该照片的索引；如果索引失败，重试沿用同一个文件结果。宿主语义依据 [图片接口](https://github.com/SillyTavern/SillyTavern/blob/release/src/endpoints/images.js)、[文件接口](https://github.com/SillyTavern/SillyTavern/blob/release/src/endpoints/files.js)、[账号静态路由](https://github.com/SillyTavern/SillyTavern/blob/release/src/users.js) 与 [相对路径转换](https://github.com/SillyTavern/SillyTavern/blob/release/src/util.js)。

独立预览使用 IndexedDB 保存 Blob 与索引，事务完成才确认写入。引用使用稳定的预览路径；挂载时恢复 object URL，真实卸载后释放。
