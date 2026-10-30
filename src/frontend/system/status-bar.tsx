import { useEffect, useState } from "react";
export function StatusBar({ light, active }: { light: boolean; active: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      const date = new Date();
      setNow(date);
      timer = setTimeout(update, 60000 - (date.getSeconds() * 1000 + date.getMilliseconds()));
    };
    const visible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        update();
      }
    };
    update();
    document.addEventListener("visibilitychange", visible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [active]);
  return (
    <div
      className={`status-bar ${light ? "status-bar--light" : ""}`}
      aria-label={`本地时间 ${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}，信号满格，电量充足`}
    >
      <div className="status-network" aria-hidden="true">
        <span className="status-signal">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
        <span>STE</span>
        <svg className="status-wifi" viewBox="0 0 20 16">
          <path d="M2 5a13 13 0 0 1 16 0M5 8a8 8 0 0 1 10 0M8 11a3 3 0 0 1 4 0" />
          <circle cx="10" cy="14" r="1" />
        </svg>
      </div>
      <time>
        {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
      </time>
      <span className="status-battery" aria-hidden="true">
        <span />
      </span>
    </div>
  );
}
