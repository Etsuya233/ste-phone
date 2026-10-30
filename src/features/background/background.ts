/** 手机使用的人物资料；身份、经历和当前近况统一保留在描述中。 */
export interface CharacterProfile {
  readonly id: string;
  readonly name: string;
  readonly profileText: string;
}

export interface Chronicle {
  readonly id: string;
  readonly title: string;
  readonly content: string;
}

export interface ItemProfile {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

/** 一次完整读取的资料。名称可修改或重复，关联时使用来源、范围和条目 ID。 */
export interface PhoneBackground {
  readonly sourceId: string;
  readonly scopeId: string;
  readonly characters: readonly CharacterProfile[];
  /** 按记录创建时间、记录 ID 排序；此顺序不表示剧情先后。 */
  readonly chronicles: readonly Chronicle[];
  readonly items: readonly ItemProfile[];
  /** 来源查询结构不支持资料展示时公开具体原因。 */
  readonly backgroundError?: string;
}
