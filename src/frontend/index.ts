import { mountPhone } from "./host/mount-phone.tsx";
import { BackgroundDataSource } from "../data/data-source.ts";
import { MemoryBackgroundProvider } from "../data/memory-provider.ts";

declare const __STE_PHONE_VERSION__: string;

mountPhone({ dataSource: new BackgroundDataSource(new MemoryBackgroundProvider()) });
console.info(`[STE Phone] v${__STE_PHONE_VERSION__} 已加载`);
