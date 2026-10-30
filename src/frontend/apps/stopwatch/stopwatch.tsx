import { useEffect, useRef, useState } from "react";
import { Button, Page, Text } from "../../foundation/foundation.tsx";
export function Stopwatch({ onExit, active }: { onExit: () => void; active: boolean }) {
  const accumulated = useRef(0);
  const started = useRef(0);
  const startButton = useRef<HTMLButtonElement>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running || !active) return;
    let frame: number;
    const tick = () => {
      setElapsed(accumulated.current + performance.now() - started.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running, active]);
  const toggle = () => {
    if (running) {
      accumulated.current += performance.now() - started.current;
      setElapsed(accumulated.current);
    } else started.current = performance.now();
    setRunning(!running);
  };
  const centiseconds = Math.floor(elapsed / 10);
  const display = `${String(Math.floor(centiseconds / 6000)).padStart(2, "0")}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
  return (
    <Page title="秒表" onBack={onExit} className="stopwatch-page">
      <div className="stopwatch-face">
        <Text role="display">{display}</Text>
      </div>
      <div className="stopwatch-controls">
        <Button
          variant="reset"
          disabled={!running && elapsed === 0}
          onClick={() => {
            accumulated.current = 0;
            setRunning(false);
            setElapsed(0);
            startButton.current!.focus({ preventScroll: true });
          }}
        >
          重置
        </Button>
        <Button ref={startButton} variant={running ? "stop" : "start"} onClick={toggle}>
          {running ? "暂停" : elapsed > 0 ? "继续" : "开始"}
        </Button>
      </div>
    </Page>
  );
}
