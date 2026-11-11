/** 内置应用目录。安装只改变可用入口，业务数据仍由各应用拥有。 */
export const appCatalog = {
  map: { name: "地图", description: "探索故事地点，预览并应用地图修改", removable: true },
  gallery: { name: "图库", description: "浏览 Image Hub 保存的图片", removable: true },
  "image-playground": {
    name: "图乐园",
    description: "描述画面，通过 Image Hub 生成图片",
    removable: true,
  },
  "campus-community": {
    name: "Twitter",
    description: "浏览动态，切换人物账号参与讨论",
    removable: true,
  },
  wechat: { name: "微信", description: "切换人物帐号，与故事中的好友聊天", removable: true },
  "voice-playground": { name: "声乐园", description: "为台词配音，试听不同音色", removable: true },
  diary: { name: "日记", description: "以人物的视角记录故事与回忆", removable: true },
  database: {
    name: "Fake DBeaver",
    description: "浏览资料结构，运行只读 SQL 查询",
    removable: true,
  },
  "data-source": { name: "资料", description: "查看人物、纪要、物品与世界背景", removable: false },
  logs: { name: "日志", description: "查看小手机最近 1000 条运行日志", removable: true },
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
  grid: [
    "diary",
    "wechat",
    "database",
    "data-source",
    "logs",
    "foundation",
    "settings",
    "app-store",
    "gallery",
    "image-playground",
    "map",
    "voice-playground",
    "campus-community",
  ],
  dock: ["stopwatch"],
};
