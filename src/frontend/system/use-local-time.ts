import { useEffect, useState } from "react";

/** Refresh at minute boundaries and resync when the browser returns to the foreground. */
export function useLocalTime(active: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) {
      return;
    }
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
  return now;
}
