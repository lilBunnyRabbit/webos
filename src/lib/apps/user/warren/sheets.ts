import { fill_tokens } from "./model";

export interface SheetZones {
  /** The first sheet's header, live (a zone holding an editor) or an empty spacer as tall as the top margin. */
  head: HTMLElement;
  foot: HTMLElement;
}

// What a page break shows between two sheets: the sheet's footer, the desk, the next sheet's header. Copies of the
// live zones with their page fields filled in, rebuilt only when they change.
const painted = new WeakMap<HTMLElement, string>();

function band_html(zones: SheetZones, sheet: number, sheets: number): string {
  const copy = (zone: HTMLElement, number: number) => {
    const content = zone.querySelector(".zone-doc")?.innerHTML;
    return `<div class="${zone.className} copy" inert>${content === undefined ? "" : `<div class="zone-doc">${fill_tokens(content, number, sheets)}</div>`}</div>`;
  };
  return `${copy(zones.foot, sheet)}<div class="desk-gap"></div>${copy(zones.head, sheet + 1)}`;
}

// CSS can't give a run of siblings a minimum height, so each sheet is padded out to one page by measuring: the break
// that closes a sheet gets `--fill`, the last sheet's root `--tail`. Sheets still grow past a page; nothing is split.
export function fill_sheets(root: HTMLElement, page_ratio: number | null, zones: SheetZones | null = null): void {
  const breaks = [...root.querySelectorAll<HTMLElement>(":scope > .page-break")];
  if (page_ratio === null || !zones) {
    for (const element of breaks) {
      element.style.removeProperty("--fill");
      element.replaceChildren();
      painted.delete(element);
    }
    root.style.removeProperty("--tail");
    return;
  }
  breaks.forEach((element, index) => {
    const html = band_html(zones, index + 1, breaks.length + 1);
    if (painted.get(element) !== html) {
      element.innerHTML = html;
      painted.set(element, html);
    }
  });
  const paper = root.parentElement!;
  const page = paper.clientWidth * page_ratio - zones.head.offsetHeight - zones.foot.offsetHeight;
  const fills = breaks.map((element) => parseFloat(element.style.getPropertyValue("--fill")) || 0);
  const tail_now = parseFloat(root.style.getPropertyValue("--tail")) || 0;

  let start = 0;
  const next = breaks.map((element) => {
    const height = element.offsetTop - start;
    start = element.offsetTop + element.offsetHeight;
    return Math.max(0, Math.round(page - height));
  });
  const tail = Math.max(0, Math.round(page - (root.offsetHeight - tail_now - start)));

  breaks.forEach((element, index) => {
    if (next[index] !== fills[index]) element.style.setProperty("--fill", `${next[index]}px`);
  });
  if (tail !== tail_now) root.style.setProperty("--tail", `${tail}px`);
}
