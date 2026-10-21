// CSS can't give a run of siblings a minimum height, so each sheet is padded out to one page by measuring: the break
// that closes a sheet gets `--fill`, the last sheet's root `--tail`. Sheets still grow past a page; nothing is split.
export function fill_sheets(root: HTMLElement, page_ratio: number | null): void {
  const breaks = [...root.querySelectorAll<HTMLElement>(":scope > .page-break")];
  if (page_ratio === null) {
    for (const element of breaks) element.style.removeProperty("--fill");
    root.style.removeProperty("--tail");
    return;
  }
  const paper = root.parentElement!;
  const style = getComputedStyle(paper);
  const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
  const page = paper.clientWidth * page_ratio - padding;
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
