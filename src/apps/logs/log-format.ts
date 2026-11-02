/** 日志详情会进入 LocalStorage，先转成可序列化文本，避免 Error 与循环引用丢失。 */
export function formatLogDetails(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(toJsonValue(value, new WeakSet()), null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

function toJsonValue(value: unknown, seen: WeakSet<object>): unknown {
  if (typeof value === "bigint") {
    return `${value}n`;
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (seen.has(value)) {
    return "[Circular]";
  }
  seen.add(value);
  const result =
    value instanceof Error || value instanceof DOMException
      ? {
          name: value.name,
          message: value.message,
          stack: value.stack,
          ...(value.cause === undefined ? {} : { cause: toJsonValue(value.cause, seen) }),
        }
      : Array.isArray(value)
        ? value.map((item) => toJsonValue(item, seen))
        : Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, toJsonValue(item, seen)]),
          );
  seen.delete(value);
  return result;
}
