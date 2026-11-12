import { closeHistory } from "prosemirror-history";
import type { Node as EditorNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import type { GalleryImageReference } from "../../gallery/public.ts";

/** 每个图片块都拥有自己的查看与移除控件，图库引用可以重复出现。 */
export class NotesEditorImage implements NodeView {
  readonly dom: HTMLElement;
  readonly #open: HTMLButtonElement;
  readonly #remove: HTMLButtonElement;

  constructor(
    node: EditorNode,
    view: EditorView,
    getPos: () => number | undefined,
    imageUrl: (path: string) => string,
    openImage: (image: GalleryImageReference) => void,
  ) {
    const reference = node.attrs.image as GalleryImageReference;
    const document = view.dom.ownerDocument;
    this.dom = document.createElement("figure");
    this.dom.className = "notes-editor-image";
    this.dom.contentEditable = "false";

    this.#open = document.createElement("button");
    this.#open.type = "button";
    this.#open.className = "notes-editor-image-open";
    this.#open.setAttribute("aria-label", "查看图片");
    this.#open.addEventListener("click", () => openImage(reference));

    const image = document.createElement("img");
    image.alt = "";
    image.draggable = false;
    const missing = document.createElement("span");
    missing.className = "notes-editor-image-missing";
    missing.textContent = "图片不可用";
    missing.hidden = true;
    const showMissing = () => {
      image.hidden = true;
      missing.hidden = false;
      this.#open.disabled = true;
      this.#open.setAttribute("aria-label", "图片不可用");
    };
    image.addEventListener("error", showMissing);
    try {
      image.src = imageUrl(reference.imagePath);
    } catch {
      // 预览图库在对应本地文件已清空时直接报错。
      showMissing();
    }
    this.#open.append(image, missing);

    this.#remove = document.createElement("button");
    this.#remove.type = "button";
    this.#remove.className = "notes-editor-image-remove";
    this.#remove.textContent = "移除图片";
    this.#remove.addEventListener("click", () => {
      const position = getPos();
      if (view.editable && position !== undefined) {
        view.dispatch(closeHistory(view.state.tr).delete(position, position + node.nodeSize));
      }
    });
    this.dom.append(this.#open, this.#remove);
  }

  stopEvent(event: Event): boolean {
    const target = event.target;
    return target instanceof Node && (this.#open.contains(target) || this.#remove.contains(target));
  }

  // 图片加载状态属于展示，避免编辑器把占位变化当作正文输入。
  ignoreMutation(): boolean {
    return true;
  }
}
