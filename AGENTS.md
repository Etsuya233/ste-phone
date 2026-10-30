## 语言与风格

禁止使用“不是...而是...”“是...不是...不是...”的句式。禁止滥用分点、分段、短句。禁止爹味，说教。

## 通用规则

所有文件以 UTF-8 保存和读取。首次执行先阅读 README.md，不存在时跳过。
从原始需求出发；只有关键歧义会导致明显不同方案或较高错误成本时先澄清，其余情况说明合理假设并继续。

## 代码规则

禁止写防御性的兜底代码，有问题尽早暴露。禁止无用、十分薄或过于抽象的辅助方法，代码需要清晰、符合直觉。
禁止以 XxxResolver 命名类，类名需要符合语义。禁止无用的测试方法。

## Skills 规则

不得主动读取任何 Superpowers 相关 Skills。
以下 Skills 仅在用户或允许读取的 Skills 内提及时读取：ask-matt、grill-with-docs、triage、setup-matt-pocock-skills、to-spec、to-tickets、implement、wayfinder、prototype、grill-me、handoff、teach、writing-great-skills、to-prd。

## 资源

外部参考资源放在 tmp 中，例如 SillyTavern 源码、样例插件、文档、聊天 JSONL 和角色卡。可查阅，已跟踪文件不得依赖其中内容；资源不进入 Git。

## 开发详情

本项目开发 SillyTavern 小手机插件。当前工作区仅有约定，功能和技术栈待确定。
修改前端页面、公共组件、工作区状态、ST 接线或样式时，先阅读 [前端开发规范](docs/ui/frontend-development.md)。预览与验收约定见 [前端开发与验收](docs/ui/frontend-preview.md)。

## Worktree

新建 Git Worktree 统一放在主仓库根目录的 `.worktrees/<名称>/` 下；在已有 Worktree 中操作时，仍使用主仓库的该目录。

## Agent 文档

维护本地需求和 Issue 时阅读 [Issue tracker](docs/agents/issue-tracker.md)，设置分诊状态时阅读 [Triage labels](docs/agents/triage-labels.md)。
探索领域概念或作架构决定时阅读 [Domain docs](docs/agents/domain.md)；术语放在根目录 CONTEXT.md，决策放在 docs/adr/。
