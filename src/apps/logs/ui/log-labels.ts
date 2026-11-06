import { appCatalog } from "../../../core/launcher/catalog.ts";
import type { PhoneLogApp, PhoneLogLevel } from "../public.ts";

export function logAppName(app: PhoneLogApp): string {
  return app === "system" ? "系统" : appCatalog[app].name;
}

export function levelName(level: PhoneLogLevel): string {
  return level === "info" ? "信息" : level === "warn" ? "警告" : "错误";
}

export function formatTime(time: number): string {
  const date = new Date(time);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(
    date.getMilliseconds(),
  ).padStart(3, "0")}`;
}

export function formatFullTime(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${formatTime(
    time,
  )}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
