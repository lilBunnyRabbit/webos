import { format_lines, LineKind, type Line } from "./format";
import { media_token } from "./journal";

const BLOCKS = new Set(["DIV", "P", "LI", "H1", "H2", "H3", "BLOCKQUOTE", "PRE"]);

function is_tail(node: Node): boolean {
  return node instanceof HTMLBRElement && node.dataset.tail !== undefined;
}

export function read_body(node: Node): string {
  let text = "";
  for (const child of node.childNodes) {
    if (child instanceof Text) text += child.data;
    else if (child instanceof HTMLImageElement) text += child.dataset.media ? media_token(child.dataset.media) : "";
    else if (child instanceof HTMLBRElement) text += is_tail(child) ? "" : "\n";
    else if (child instanceof HTMLElement) {
      if (BLOCKS.has(child.tagName) && text && !text.endsWith("\n")) text += "\n";
      text += read_body(child);
    }
  }
  return text;
}

function text_length(node: Node): number {
  if (node instanceof Text) return node.data.length;
  if (node instanceof HTMLImageElement) return node.dataset.media ? media_token(node.dataset.media).length : 0;
  if (node instanceof HTMLBRElement) return is_tail(node) ? 0 : 1;
  let total = 0;
  for (const child of node.childNodes) total += text_length(child);
  return total;
}

export function offset_of(root: Node, target: Node, offset: number): number {
  let total = 0;
  const walk = (node: Node): boolean => {
    if (node === target) {
      if (node instanceof Text) total += offset;
      else for (let i = 0; i < offset && i < node.childNodes.length; i++) total += text_length(node.childNodes[i]);
      return true;
    }
    if (node instanceof Text || node instanceof HTMLImageElement || node instanceof HTMLBRElement) {
      total += text_length(node);
      return false;
    }
    for (const child of node.childNodes) if (walk(child)) return true;
    return false;
  };
  return walk(root) ? total : text_length(root);
}

/** The DOM position for a character offset. An offset inside a photo's token lands after the photo. */
export function position_at(root: Node, offset: number): { node: Node; offset: number } {
  let left = Math.max(0, offset);
  const walk = (node: Node): { node: Node; offset: number } | null => {
    for (let i = 0; i < node.childNodes.length; i++) {
      const child = node.childNodes[i];
      if (child instanceof Text) {
        if (left <= child.data.length) return { node: child, offset: left };
        left -= child.data.length;
      } else if (child instanceof HTMLImageElement || child instanceof HTMLBRElement) {
        const length = text_length(child);
        if (left === 0) return { node, offset: i };
        if (left < length) return { node, offset: i + 1 };
        left -= length;
      } else {
        const found = walk(child);
        if (found) return found;
      }
    }
    return null;
  };
  const tail = root.lastChild && is_tail(root.lastChild) ? 1 : 0;
  return walk(root) ?? { node: root, offset: root.childNodes.length - tail };
}

export function caret_offsets(root: HTMLElement): { start: number; end: number } | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection?.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  return {
    start: offset_of(root, range.startContainer, range.startOffset),
    end: offset_of(root, range.endContainer, range.endOffset),
  };
}

export function place_caret(root: HTMLElement, offset: number): void {
  const position = position_at(root, offset);
  const range = root.ownerDocument.createRange();
  range.setStart(position.node, position.offset);
  range.collapse(true);
  const selection = root.ownerDocument.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function build(document: Document, lines: Line[], image_for: (id: string) => HTMLImageElement): DocumentFragment {
  const fragment = document.createDocumentFragment();
  lines.forEach((line, index) => {
    if (index > 0) fragment.append("\n");
    let target: Node = fragment;
    if (line.kind !== LineKind.TEXT) {
      const span = document.createElement("span");
      span.className = `md-${line.kind}`;
      fragment.append(span);
      target = span;
    }
    for (const segment of line.segments) {
      if ("media" in segment) target.appendChild(image_for(segment.media));
      else if (!segment.text) continue;
      else if (!segment.marks.length) target.appendChild(document.createTextNode(segment.text));
      else {
        const span = document.createElement("span");
        span.className = segment.marks.map((mark) => `md-${mark}`).join(" ");
        span.textContent = segment.text;
        target.appendChild(span);
      }
    }
  });
  if (lines.length > 1 && lines.at(-1)?.segments.length === 0) {
    const tail = document.createElement("br");
    tail.dataset.tail = "";
    fragment.append(tail);
  }
  return fragment;
}

/** Structure only, adjacent text merged, so "the browser typed into the right node" compares equal and nothing re-renders. */
function shape(node: Node): string {
  let out = "";
  let text: string | null = null;
  const flush = () => {
    if (text !== null) out += `t${JSON.stringify(text)}`;
    text = null;
  };
  for (const child of node.childNodes) {
    if (child instanceof Text) {
      if (child.data) text = (text ?? "") + child.data;
      continue;
    }
    flush();
    if (child instanceof HTMLImageElement) out += `[img ${child.dataset.media ?? ""}]`;
    else if (child instanceof HTMLBRElement) out += is_tail(child) ? "[tail]" : "[br]";
    else if (child instanceof HTMLSpanElement) out += `<${child.className}>${shape(child)}</>`;
    else out += `<?${child.nodeName}>`;
  }
  flush();
  return out;
}

/**
 * Re-renders `root` for `body` when its structure differs from what's there, keeping photo elements (their object URLs
 * load once). Returns whether it did, so the caller restores the caret.
 */
export function restyle(root: HTMLElement, body: string, image_for: (id: string) => HTMLImageElement): boolean {
  const lines = format_lines(body);
  const probe = build(root.ownerDocument, lines, (id) => {
    const image = root.ownerDocument.createElement("img");
    image.dataset.media = id;
    return image;
  });
  if (shape(root) === shape(probe)) return false;
  const existing = new Map<string, HTMLImageElement>();
  for (const image of root.querySelectorAll<HTMLImageElement>("img[data-media]"))
    existing.set(image.dataset.media!, image);
  const fragment = build(root.ownerDocument, lines, (id) => {
    const image = existing.get(id);
    existing.delete(id);
    return image ?? image_for(id);
  });
  root.replaceChildren(fragment);
  return true;
}
