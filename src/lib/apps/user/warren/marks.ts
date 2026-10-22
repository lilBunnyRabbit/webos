export const MARK_CLASS = "wr-mark";

const BLOCKS = "p, h1, h2, h3, h4, h5, h6, blockquote, li";
const SPACE = { " ": "·", " ": "°", "\t": "→" } as Record<string, string>;

interface Mark {
  glyph: string;
  x: number;
  y: number;
  height: number;
  width?: number;
}

// Decorators (page breaks, pictures) and the filled-in header and footer copies hold no typed text.
const skipped = (node: Node) => !!node.parentElement?.closest("[contenteditable='false'], .wr-image, .copy");

function space_marks(root: HTMLElement, range: Range, marks: Mark[]) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (skipped(node)) continue;
    const text = node.textContent ?? "";
    for (let index = 0; index < text.length; index++) {
      const glyph = SPACE[text[index]];
      if (!glyph) continue;
      range.setStart(node, index);
      range.setEnd(node, index + 1);
      const box = range.getBoundingClientRect();
      if (!box.height) continue;
      marks.push({ glyph, x: box.left, y: box.top, height: box.height, width: box.width });
    }
  }
}

function last_leaf(block: Element): Node | null {
  let node: Node | null = block.lastChild;
  while (node) {
    if (node instanceof Element && (node.matches("ul, ol") || node.getAttribute("contenteditable") === "false")) node = node.previousSibling;
    else if (node.lastChild) node = node.lastChild;
    else return node;
  }
  return null;
}

// A <br> with something after it is a typed line break; a lone one is Lexical's placeholder in an empty block.
function block_marks(root: HTMLElement, range: Range, marks: Mark[]) {
  for (const br of root.querySelectorAll("br")) {
    if (skipped(br) || !br.nextSibling) continue;
    const box = br.getBoundingClientRect();
    marks.push({ glyph: "↵", x: box.left, y: box.top, height: box.height });
  }
  for (const block of root.querySelectorAll(BLOCKS)) {
    if (skipped(block) || (block.matches("li") && block.querySelector(":scope > ul, :scope > ol") && !block.textContent?.trim())) continue;
    if (block.querySelector(BLOCKS)) continue;
    const leaf = last_leaf(block);
    let box: DOMRect;
    if (leaf instanceof Text && leaf.length) {
      range.setStart(leaf, leaf.length - 1);
      range.setEnd(leaf, leaf.length);
      const rects = range.getClientRects();
      const last = rects[rects.length - 1];
      if (!last) continue;
      box = new DOMRect(last.right, last.top, 0, last.height);
    } else if (leaf instanceof HTMLBRElement) {
      box = leaf.getBoundingClientRect();
    } else {
      const own = block.getBoundingClientRect();
      const style = getComputedStyle(block);
      box = new DOMRect(own.left + parseFloat(style.paddingLeft), own.top + parseFloat(style.paddingTop), 0, parseFloat(style.lineHeight) || 16);
    }
    marks.push({ glyph: "¶", x: box.left, y: box.top, height: box.height });
  }
}

// The layer sits beside the editors, so neither the editor state nor an export ever sees a mark.
export function draw_marks(roots: HTMLElement[], layer: HTMLElement) {
  const origin = layer.getBoundingClientRect();
  const range = document.createRange();
  const marks: Mark[] = [];
  for (const root of roots) {
    space_marks(root, range, marks);
    block_marks(root, range, marks);
  }
  const fragment = document.createDocumentFragment();
  for (const mark of marks) {
    const element = document.createElement("span");
    element.className = MARK_CLASS;
    element.textContent = mark.glyph;
    element.style.left = `${mark.x - origin.left}px`;
    element.style.top = `${mark.y - origin.top}px`;
    element.style.height = element.style.lineHeight = `${mark.height}px`;
    element.style.fontSize = `${Math.max(8, mark.height * 0.6)}px`;
    if (mark.width !== undefined) {
      element.style.width = `${mark.width}px`;
      element.style.textAlign = "center";
    }
    fragment.append(element);
  }
  layer.replaceChildren(fragment);
}
