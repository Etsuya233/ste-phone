import { useEffect, useState } from "react";

/** 前台每分钟更新日期标签，回到页面或浏览器恢复可见时立即校准；后台停止计时。 */
export function useWechatClock(active: boolean): Date {
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
