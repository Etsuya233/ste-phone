import { useRef } from "react";

export function PhoneApp() {
  const panel = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className="phone-launcher"
        aria-label="打开小手机"
        aria-controls="ste-phone-panel"
        onClick={() => panel.current!.showModal()}
      >
        手机
      </button>
      <dialog
        id="ste-phone-panel"
        className="phone-panel"
        aria-labelledby="ste-phone-title"
        ref={panel}
      >
        <header className="phone-header">
          <span id="ste-phone-title">STE Phone</span>
          <button aria-label="关闭小手机" onClick={() => panel.current!.close()}>
            关闭
          </button>
        </header>
        <main className="phone-content">
          <h1>小手机</h1>
          <p>工作区已就绪。</p>
        </main>
      </dialog>
    </>
  );
}
