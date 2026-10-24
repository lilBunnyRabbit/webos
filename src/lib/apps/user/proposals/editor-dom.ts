import { ImageDisplay, is_image, normalize_content, type Content, type Run } from "./model";

const BLOCK_TAGS = new Set(["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE"]);

export function image_element(image: string, display: ImageDisplay): HTMLImageElement {
  const element = document.createElement("img");
  element.src = image;
  element.alt = "Picture";
  element.draggable = false;
  element.dataset.display = display;
  return element;
}

export function render_runs(root: HTMLElement, content: Content) {
  root.replaceChildren(
    ...content.map((run) => (is_image(run) ? image_element(run.image, run.display) : document.createTextNode(run.text)))
  );
}

const display_of = (element: HTMLElement): ImageDisplay =>
  element.dataset.display === ImageDisplay.BLOCK ? ImageDisplay.BLOCK : ImageDisplay.INLINE;

/** The editor's DOM back to runs. Chrome may still wrap lines in `<div>` or end them with `<br>`; both read as line breaks. */
export function read_runs(root: Node): Content {
  const runs: Run[] = [];
  const ends_line = () => {
    const last = runs.at(-1);
    return !last || (!is_image(last) && last.text.endsWith("\n")) || (is_image(last) && last.display === ImageDisplay.BLOCK);
  };
  const walk = (node: Node) => {
    for (const child of node.childNodes) {
      if (child instanceof Text) runs.push({ text: child.data });
      else if (child instanceof HTMLImageElement) {
        const image = child.getAttribute("src") ?? "";
        if (image.startsWith("data:image/")) runs.push({ image, display: display_of(child) });
      } else if (child instanceof HTMLBRElement) runs.push({ text: "\n" });
      else if (child instanceof HTMLElement) {
        if (BLOCK_TAGS.has(child.tagName) && !ends_line()) runs.push({ text: "\n" });
        walk(child);
      }
    }
  };
  walk(root);
  return normalize_content(runs);
}

export function toggle_display(element: HTMLImageElement) {
  element.dataset.display = display_of(element) === ImageDisplay.BLOCK ? ImageDisplay.INLINE : ImageDisplay.BLOCK;
}

export function insert_image(root: HTMLElement, range: Range | null, image: string, display: ImageDisplay): HTMLImageElement {
  const element = image_element(image, display);
  if (range && root.contains(range.commonAncestorContainer)) {
    range.deleteContents();
    range.insertNode(element);
  } else root.append(element);
  const after = document.createRange();
  after.setStartAfter(element);
  after.collapse(true);
  const selection = root.ownerDocument.getSelection();
  if (selection && root.ownerDocument.activeElement === root) {
    selection.removeAllRanges();
    selection.addRange(after);
  }
  return element;
}
