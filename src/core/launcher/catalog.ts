/** 内置应用目录。安装只改变可用入口，业务数据仍由各应用拥有。 */
export const appCatalog = {
  database: {
    name: "Fake DBeaver",
    description: "浏览资料结构，运行只读 SQL 查询",
    removable: true,
  },
  "data-source": { name: "资料", description: "查看人物、纪要、物品与世界背景", removable: false },
  foundation: { name: "组件", description: "体验手机的基础控件与导航", removable: true },
  settings: { name: "设置", description: "设置壁纸与模型连接", removable: false },
  "app-store": {
    name: "App Store",
    description: "发现应用，重新下载已卸载的应用",
    removable: false,
  },
  stopwatch: { name: "秒表", description: "记录时间，支持分段计时", removable: true },
} as const;
export type AppId = keyof typeof appCatalog;
export interface HomeLayout {
  readonly grid: readonly AppId[];
  readonly dock: readonly AppId[];
}
export const defaultHomeLayout: HomeLayout = {
  grid: ["database", "data-source", "foundation", "settings", "app-store"],
  dock: ["stopwatch"],
};
