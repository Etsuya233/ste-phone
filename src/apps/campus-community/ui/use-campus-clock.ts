import { useEffect, useState } from "react";

/** 前台每分钟更新相对时间；后台停止计时，回到页面时立即校准。 */
export function useCampusClock(active: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) {
      return;
    }
    const update = () => setNow(new Date());
    update();
    const timer = setInterval(update, 60000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, [active]);
  return now;
}
