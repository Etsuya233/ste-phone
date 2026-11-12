import { useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import type { Ref } from "react";
import { baseKeymap } from "prosemirror-commands";
import { closeHistory, history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { EditorState, Selection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { GalleryImageReference } from "../../gallery/public.ts";
import type { NotesBlock } from "../notes.ts";
import {
  createNotesDocument,
  insertNoteImage,
  notesPlainTextSlice,
  readNotesDocument,
} from "./notes-editor-document.ts";
import { NotesEditorImage } from "./notes-editor-image.ts";

export interface NotesEditorHandle {
  getInsertionPoint(): number;
  insertTextAt(position: number, text: string): void;
  insertImageAt(position: number, image: GalleryImageReference): void;
}

interface NotesEditorProps {
  ref?: Ref<NotesEditorHandle>;
  initialBlocks: readonly NotesBlock[];
  readOnly: boolean;
  onChange(blocks: readonly NotesBlock[]): void;
  imageUrl(path: string): string;
  onOpenImage(image: GalleryImageReference): void;
}

/** 一个编辑器会话对应一个挂载实例，文档和选区由编辑器持有。 */
export function NotesEditor({
  ref,
  initialBlocks,
  readOnly,
  onChange,
  imageUrl,
  onOpenImage,
}: NotesEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<EditorView>(null);
  const callbacks = useRef({ onChange, imageUrl, onOpenImage });
  const [startingDocument] = useState(() => createNotesDocument(initialBlocks));

  useLayoutEffect(() => {
    callbacks.current = { onChange, imageUrl, onOpenImage };
  }, [onChange, imageUrl, onOpenImage]);

  useLayoutEffect(() => {
    const view = new EditorView(host.current!, {
      state: EditorState.create({
        doc: startingDocument,
        plugins: [
          history(),
          keymap({ "Mod-z": undo, "Mod-Shift-z": redo, "Mod-y": redo }),
          keymap(baseKeymap),
        ],
      }),
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction));
        if (transaction.docChanged) {
          callbacks.current.onChange(readNotesDocument(view.state.doc));
        }
      },
      nodeViews: {
        image: (node, view, getPos) =>
          new NotesEditorImage(node, view, getPos, callbacks.current.imageUrl, (image) => {
            callbacks.current.onOpenImage(image);
          }),
      },
      handlePaste(view, event) {
        const text = event.clipboardData?.getData("text/plain");
        if (text) {
          const transaction = view.state.tr.replaceSelection(notesPlainTextSlice(text));
          view.dispatch(transaction.setMeta("uiEvent", "paste"));
        }
        return true;
      },
      // 手机外壳负责选区避让，只滚动 Page 内层。
      handleScrollToSelection: () => true,
    });
    editor.current = view;
    return () => {
      view.destroy();
      editor.current = null;
    };
  }, [startingDocument]);

  useLayoutEffect(() => {
    editor.current!.setProps({
      editable: () => !readOnly,
      attributes: {
        class: "notes-editor",
        role: "textbox",
        "aria-label": "备忘录正文",
        "aria-multiline": "true",
        "aria-readonly": String(readOnly),
        tabindex: "0",
      },
    });
  }, [readOnly]);

  useImperativeHandle(
    ref,
    () => ({
      getInsertionPoint: () => editor.current!.state.selection.to,
      // 采用 AI 候选属于显式提交，可从只读预览回到可编辑正文。
      insertTextAt(position, text) {
        const view = editor.current!;
        const transaction = closeHistory(view.state.tr).replace(
          position,
          position,
          notesPlainTextSlice(text),
        );
        const end = transaction.doc.resolve(transaction.mapping.map(position));
        view.dispatch(transaction.setSelection(Selection.near(end, -1)));
      },
      insertImageAt(position, image) {
        const view = editor.current!;
        view.dispatch(insertNoteImage(view.state, position, image));
      },
    }),
    [],
  );

  return <div ref={host} />;
}
