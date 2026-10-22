import {
  $create,
  $createParagraphNode,
  $getDocument,
  defineExtension,
  ElementNode,
  type DOMConversionOutput,
  type DOMExportOutput,
  type LexicalEditor,
  type LexicalNode,
  type ParagraphNode,
  type RangeSelection,
} from "lexical";
import { TITLE } from "./model";
import { TITLE_CLASS } from "./print";

// Word's Title is a paragraph style with no outline level, so it's its own block rather than a heading: it stays out
// of the outline and the .docx navigation pane.
export class TitleNode extends ElementNode {
  $config() {
    return this.config(TITLE, {
      extends: ElementNode,
      importDOM: {
        p: (element: HTMLElement) => (element.classList.contains(TITLE_CLASS) || element.classList.contains("title") ? { conversion: $convert_title, priority: 1 as const } : null),
      },
    });
  }

  createDOM(): HTMLElement {
    const element = $getDocument().createElement("p");
    element.className = TITLE_CLASS;
    return element;
  }

  updateDOM(): boolean {
    return false;
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const { element } = super.exportDOM(editor);
    if (element instanceof HTMLElement && this.isEmpty()) element.append($getDocument().createElement("br"));
    return { element };
  }

  insertNewAfter(selection: RangeSelection, restore?: boolean): ParagraphNode {
    const paragraph = $createParagraphNode();
    paragraph.setTextFormat(selection.format);
    paragraph.setTextStyle(selection.style);
    paragraph.setFormat(this.getFormatType());
    this.insertAfter(paragraph, restore);
    return paragraph;
  }

  collapseAtStart(): true {
    const paragraph = $createParagraphNode();
    for (const child of this.getChildren()) paragraph.append(child);
    paragraph.setFormat(this.getFormatType());
    this.replace(paragraph);
    return true;
  }
}

function $convert_title(element: HTMLElement): DOMConversionOutput {
  const node = $create_title();
  const align = element.style.textAlign;
  if (align === "left" || align === "center" || align === "right" || align === "justify") node.setFormat(align);
  return { node };
}

export function $create_title(): TitleNode {
  return $create(TitleNode);
}

export function $is_title(node: LexicalNode | null | undefined): node is TitleNode {
  return node instanceof TitleNode;
}

export const TitleExtension = defineExtension({
  name: "@webos/warren/Title",
  nodes: () => [TitleNode],
});
