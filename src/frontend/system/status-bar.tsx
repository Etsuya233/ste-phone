import { useLocalTime } from "./use-local-time.ts";
export function StatusBar({
  light,
  active,
  hideTime = false,
}: {
  light: boolean;
  active: boolean;
  hideTime?: boolean;
}) {
  const now = useLocalTime(active && !hideTime);

  return (
    <div
      className={`status-bar ${light ? "status-bar--light" : ""}`}
      aria-label={
        hideTime
          ? "信号满格，电量充足"
          : `本地时间 ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}，信号满格，电量充足`
      }
    >
      <div className="status-network" aria-hidden="true">
        <span className="status-signal">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="status-carrier">STE</span>
        <svg className="status-wifi" viewBox="0 0 20 16">
          <path d="M2 5a13 13 0 0 1 16 0M5 8a8 8 0 0 1 10 0M8 11a3 3 0 0 1 4 0" />
          <circle cx="10" cy="14" r="1" />
        </svg>
      </div>
      {!hideTime ? (
        <time>
          {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
        </time>
      ) : null}
      <span className="status-battery" aria-hidden="true">
        <span />
      </span>
    </div>
  );
}
