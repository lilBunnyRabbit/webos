export interface LocalBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Scale {
  left: number;
  top: number;
  x: number;
  y: number;
}

// The used size, not offsetWidth: that one is rounded to whole px and skews a tall canvas by a fraction of a px.
function scale_of(outer: HTMLElement): Scale | null {
  const rect = outer.getBoundingClientRect();
  const style = getComputedStyle(outer);
  const width = parseFloat(style.width);
  const height = parseFloat(style.height);
  if (!(rect.width >= 1 && rect.height >= 1 && width >= 1 && height >= 1)) return null;
  return { left: rect.left, top: rect.top, x: rect.width / width, y: rect.height / height };
}

/**
 * `inner`'s box in `outer`'s own CSS px, with any transform on a shared ancestor taken out. A window that opens with a
 * scale (Contact) is measured mid-animation, and no ResizeObserver fires once the transform ends, so client rects alone
 * would leave the swarm's box and its mask a few percent small and off-centre for good.
 */
export function local_box(outer: HTMLElement, inner: HTMLElement): LocalBox | null {
  const scale = scale_of(outer);
  if (!scale) return null;
  const to = inner.getBoundingClientRect();
  return { x: (to.left - scale.left) / scale.x, y: (to.top - scale.top) / scale.y, width: to.width / scale.x, height: to.height / scale.y };
}

export function local_point(outer: HTMLElement, x: number, y: number): { x: number; y: number } | null {
  const scale = scale_of(outer);
  return scale ? { x: (x - scale.left) / scale.x, y: (y - scale.top) / scale.y } : null;
}
