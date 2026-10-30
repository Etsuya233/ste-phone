import { createPortal } from "react-dom";

export interface StMenuEntry {
  menu: HTMLElement;
  button: HTMLElement;
}

export function StEntry({
  menu,
  button,
  open,
  onOpen,
}: StMenuEntry & { open: boolean; onOpen: () => void }) {
  return createPortal(
    <div
      id="ste-phone-wand-entry"
      className="list-group-item flex-container flexGap5 interactable"
      role="button"
      tabIndex={0}
      title="小手机"
      aria-label="打开小手机"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={(event) => {
        event.stopPropagation();
        // 交给 ST 自己切换菜单，同时更新其弹层状态，随后打开原生 dialog。
        button.click();
        button.focus();
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.click();
        }
      }}
    >
      <div
        className="fa-solid fa-mobile-screen-button fa-fw extensionsMenuExtensionButton"
        aria-hidden="true"
      />
      <span>小手机</span>
    </div>,
    menu,
  );
}
