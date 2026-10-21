import { $create, $getDocument, DecoratorNode, defineExtension, type DOMExportOutput, type LexicalNode } from "lexical";
import { PAGE_BREAK } from "./model";

export class PageBreakNode extends DecoratorNode<null> {
  $config() {
    return this.config(PAGE_BREAK, {
      extends: DecoratorNode,
      importDOM: {
        hr: (element: HTMLElement) =>
          element.classList.contains("page-break") ? { conversion: () => ({ node: $create_page_break() }), priority: 1 as const } : null,
      },
    });
  }

  createDOM(): HTMLElement {
    const element = $getDocument().createElement("div");
    element.className = "page-break";
    element.contentEditable = "false";
    element.setAttribute("role", "separator");
    element.setAttribute("aria-label", "Page break");
    return element;
  }

  exportDOM(): DOMExportOutput {
    const element = $getDocument().createElement("div");
    element.style.breakBefore = "page";
    return { element };
  }

  updateDOM(): boolean {
    return false;
  }

  getTextContent(): string {
    return "\n";
  }

  isInline(): false {
    return false;
  }

  decorate(): null {
    return null;
  }
}

export function $create_page_break(): PageBreakNode {
  return $create(PageBreakNode);
}

export function $is_page_break(node: LexicalNode | null | undefined): node is PageBreakNode {
  return node instanceof PageBreakNode;
}

export const PageBreakExtension = defineExtension({
  name: "@webos/warren/PageBreak",
  nodes: () => [PageBreakNode],
});
