import { closeHistory } from "prosemirror-history";
import { Fragment, Schema, Slice } from "prosemirror-model";
import type { Node } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import type { EditorState, Transaction } from "prosemirror-state";
import type { GalleryImageReference } from "../../gallery/public.ts";
import type { NotesBlock } from "../notes.ts";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "text*",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },
    text: {},
    image: {
      group: "block",
      atom: true,
      attrs: { image: {} },
      // 剪贴板只携带文字。图库引用只从应用内选图进入文档。
      toDOM: () => ["figure", "图片"],
    },
  },
});

const paragraph = schema.nodes.paragraph!;
const photo = schema.nodes.image!;

export function createNotesDocument(blocks: readonly NotesBlock[]): Node {
  const content: Node[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      content.push(paragraph.create(null, block.text ? schema.text(block.text) : undefined));
    } else {
      // 图片在首尾或相邻时也保留可落光标的行。
      if (content.at(-1)?.type !== paragraph) {
        content.push(paragraph.create());
      }
      content.push(photo.create({ image: block.image }));
    }
  }
  if (content.at(-1)?.type !== paragraph) {
    content.push(paragraph.create());
  }
  return schema.nodes.doc!.create(null, content);
}

export function readNotesDocument(doc: Node): NotesBlock[] {
  return doc.children.map((node) =>
    node.type === paragraph
      ? { type: "paragraph", text: node.textContent }
      : { type: "image", image: node.attrs.image as GalleryImageReference },
  );
}

export function notesPlainTextSlice(text: string): Slice {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return Slice.maxOpen(
    Fragment.fromArray(
      lines.map((line) => paragraph.create(null, line ? schema.text(line) : undefined)),
    ),
  );
}

export function insertNoteImage(
  state: EditorState,
  position: number,
  image: GalleryImageReference,
): Transaction {
  const point = state.doc.resolve(position);
  const node = photo.create({ image });
  const transaction = closeHistory(state.tr);
  if (point.parent.isTextblock) {
    // 在原光标处拆开段落，图片后接原有文字，确认后可直接在此继续写。
    const left = point.parent.cut(0, point.parentOffset);
    const right = point.parent.cut(point.parentOffset);
    transaction.replaceWith(point.before(), point.after(), [left, node, right]);
    const afterImage = point.before() + left.nodeSize + node.nodeSize + 1;
    return transaction.setSelection(TextSelection.create(transaction.doc, afterImage));
  }
  transaction.insert(position, [node, paragraph.create()]);
  return transaction.setSelection(
    TextSelection.create(transaction.doc, position + node.nodeSize + 1),
  );
}
