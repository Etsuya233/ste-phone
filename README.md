# STE-PHONE

面向 SillyTavern 的小手机插件工作区。当前仅初始化仓库约定，尚未实现插件，也未确定技术栈与功能范围。

## 工作区

- `AGENTS.md`：协作与开发约定；`CLAUDE.md` 指向同一份规则。
- `tmp/`：本地外部参考资源，不进入 Git，已跟踪文件不得依赖其中内容。
- `.scratch/`：按功能组织的需求与本地 Issue，规则见 `docs/agents/issue-tracker.md`。
- `.worktrees/`：此主仓库的 Git Worktree，内容不进入 Git。
- `docs/agents/`：Issue、分诊标签与领域文档约定。
- `docs/ui/`：前端开发及验收约定。

当前没有安装、构建或运行命令。引入工程工具后，在此维护实际可执行的命令。
