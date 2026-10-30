import { mountPhone } from "./host/mount-phone.tsx";

declare const __STE_PHONE_VERSION__: string;

mountPhone();
console.info(`[STE Phone] v${__STE_PHONE_VERSION__} 已加载`);
