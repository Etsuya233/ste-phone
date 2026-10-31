import { createStSettingsStorage } from "../infrastructure/host/st-settings.ts";
import { createStAiTransport } from "../infrastructure/host/ai-transport.ts";
import { createPhone } from "../bootstrap/create-phone.tsx";
import { createStChatContext } from "../infrastructure/host/chat-context.ts";
import { mountPhone } from "./host/mount-phone.tsx";
import { MemoryDatabaseProvider } from "../infrastructure/ste-memory/memory-database-provider.ts";

declare const __STE_PHONE_VERSION__: string;

// ST 在加载扩展前创建魔法棒菜单；生产入口需要宿主提供这两个节点。
const menu = document.getElementById("extensionsMenu");
const button = document.getElementById("extensionsMenuButton");
if (!menu || !button) throw new Error("ST 魔法棒菜单尚未就绪，无法挂载小手机入口");

// 入口负责组装具体来源。数据源随插件挂载，手机窗口和各 App 只消费这个共享实例。
// 宿主上下文与 App 的具体实现只在入口组装。
const phone = createPhone({
  dataProvider: new MemoryDatabaseProvider(),
  settingsStorage: createStSettingsStorage(),
  aiTransport: createStAiTransport(() => window.SillyTavern.getContext().getRequestHeaders()),
  chat: createStChatContext(() => window.SillyTavern.getContext()),
});
mountPhone({
  apps: phone.apps,
  wallpaper: phone.wallpaper,
  homeScreen: phone.homeScreen,
  menuEntry: { menu, button },
});
console.info(`[STE Phone] v${__STE_PHONE_VERSION__} 已加载`);
