export type WebsiteSource = Readonly<{ html: string; css: string; js: string }>;

export interface WebsiteAuthor {
  readonly sourceId: string;
  readonly scopeId: string;
  readonly id: string;
  readonly name: string;
}

export interface WebsiteVersion {
  readonly savedAt: string;
  readonly title: string;
  readonly source: WebsiteSource;
}

export interface WebsiteTurn {
  readonly instruction: string;
  readonly reply: string;
}

export interface WebsiteWork {
  readonly id: string;
  readonly author: WebsiteAuthor;
  readonly title: string;
  readonly source: WebsiteSource;
  readonly turns: readonly WebsiteTurn[];
  readonly versions: readonly WebsiteVersion[];
}

export interface BrowserData {
  readonly version: 1;
  readonly works: readonly WebsiteWork[];
}

export interface BrowserStorage {
  read(chatId: string): BrowserData | null;
  write(chatId: string, data: BrowserData): Promise<void>;
}

export const emptyBrowserData: BrowserData = { version: 1, works: [] };

export function newWebsite(author: WebsiteAuthor): WebsiteWork {
  const id = [...crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return {
    id,
    author,
    title: "未命名作品",
    source: { html: "", css: "", js: "" },
    turns: [],
    versions: [],
  };
}

function hasTextFields(value: unknown, ...keys: string[]): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    keys.every((key) => typeof (value as Record<string, unknown>)[key] === "string")
  );
}

function isWebsiteSource(value: unknown): boolean {
  return hasTextFields(value, "html", "css", "js");
}

function isWebsiteWork(work: WebsiteWork): boolean {
  return (
    hasTextFields(work, "id", "title") &&
    hasTextFields(work.author, "sourceId", "scopeId", "id", "name") &&
    isWebsiteSource(work.source) &&
    Array.isArray(work.turns) &&
    work.turns.every((turn) => hasTextFields(turn, "instruction", "reply")) &&
    Array.isArray(work.versions) &&
    work.versions.every(
      (version) => hasTextFields(version, "savedAt", "title") && isWebsiteSource(version.source),
    )
  );
}

export function readBrowserData(value: unknown): BrowserData {
  const data = value as BrowserData;
  if (
    data?.version !== 1 ||
    !Array.isArray(data.works) ||
    !data.works.every(isWebsiteWork) ||
    new Set(data.works.map((work) => work.id)).size !== data.works.length
  ) {
    throw new Error("浏览器作品数据格式无效");
  }
  return data;
}
