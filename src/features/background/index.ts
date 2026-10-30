/** 手机应用与外部适配器通过此入口使用背景资料功能。 */
export type { CharacterProfile, Chronicle, ItemProfile, PhoneBackground } from "./background.ts";
export { BackgroundDataSource } from "./data-source.ts";
export type { DataSourceState, PhoneDataSource } from "./data-source.ts";
export type { BackgroundProvider, SourceContext } from "./ports/background-provider.ts";
