import { mountPhone } from "./host/mount-phone.tsx";
import { BackgroundDataSource } from "../features/background/index.ts";
import { MemoryBackgroundProvider } from "../infrastructure/ste-memory/memory-background-provider.ts";

declare const __STE_PHONE_VERSION__: string;

// 入口负责组装具体来源。数据源随插件挂载，手机窗口和各 App 只消费这个共享实例。
const dataSource = new BackgroundDataSource(new MemoryBackgroundProvider());
mountPhone({ dataSource });
console.info(`[STE Phone] v${__STE_PHONE_VERSION__} 已加载`);
