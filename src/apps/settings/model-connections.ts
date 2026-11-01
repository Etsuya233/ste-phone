export interface ModelConnection {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  customHeaders: Record<string, string>;
}

export function connectionHeaderError(
  entries: readonly (readonly [string, string])[],
): string | undefined {
  const names = new Set<string>();
  for (const [name, value] of entries) {
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) {
      return "请求头名称不合法";
    }
    const lower = name.toLowerCase();
    if (lower === "content-type") {
      return "Content-Type 固定为 application/json";
    }
    if (["host", "content-length", "connection", "transfer-encoding"].includes(lower)) {
      return `不能自定义传输请求头 ${name}`;
    }
    if (names.has(lower)) {
      return "请求头名称重复（不区分大小写）";
    }
    if (/[\r\n]/.test(value)) {
      return "请求头值不能包含换行";
    }
    names.add(lower);
  }
  return undefined;
}

export function validateModelConnection(connection: ModelConnection): ModelConnection {
  if (!connection.id.trim()) {
    throw new Error("模型连接缺少 ID");
  }
  const name = connection.name.trim();
  if (!name) {
    throw new Error("请填写连接名称");
  }
  const model = connection.model.trim();
  if (!model) {
    throw new Error("请填写模型名称");
  }
  const baseUrl = connection.baseUrl.trim().replace(/\/+$/, "");
  let address: URL;
  try {
    address = new URL(baseUrl);
  } catch {
    throw new Error("请填写有效的 Base URL");
  }
  if (!["http:", "https:"].includes(address.protocol)) {
    throw new Error("Base URL 仅支持 HTTP 或 HTTPS");
  }
  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error("Base URL 需以 http:// 或 https:// 开头");
  }
  if (address.username || address.password || address.search || address.hash) {
    throw new Error("Base URL 不能包含用户名、密码、查询参数或片段");
  }
  if (/\/chat\/completions$/i.test(address.pathname)) {
    throw new Error("请填写基础地址，不要包含 /chat/completions");
  }
  if (/[\r\n]/.test(connection.apiKey)) {
    throw new Error("API Key 不能包含换行");
  }
  const entries = Object.entries(connection.customHeaders);
  const headerError = connectionHeaderError(entries);
  if (headerError) {
    throw new Error(headerError);
  }
  return {
    ...connection,
    name,
    model,
    baseUrl,
    customHeaders: Object.fromEntries(
      entries.map(([key, value]) => [
        key.toLowerCase() === "authorization" ? "Authorization" : key,
        value,
      ]),
    ),
  };
}
