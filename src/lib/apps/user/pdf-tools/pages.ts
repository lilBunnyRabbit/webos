export type Rotation = 0 | 90 | 180 | 270;

export interface PageItem {
  id: string;
  source: number | null;
  // Clockwise, on top of the page's own /Rotate.
  rotation: Rotation;
}

export function normalize_rotation(degrees: number): Rotation {
  return ((((Math.round(degrees / 90) * 90) % 360) + 360) % 360) as Rotation;
}

export function initial_pages(count: number, make_id: () => string = () => crypto.randomUUID()): PageItem[] {
  return Array.from({ length: count }, (_, index) => ({ id: make_id(), source: index, rotation: 0 }));
}

export function move_page(pages: PageItem[], from: number, to: number): PageItem[] {
  if (from === to || from < 0 || from >= pages.length) return pages;
  const next = [...pages];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

// `slot` is the gap index (0 = before the first page).
export function move_to_slot(pages: PageItem[], from: number, slot: number): PageItem[] {
  return move_page(pages, from, slot > from ? slot - 1 : slot);
}

export function rotate_page(pages: PageItem[], id: string, delta: number): PageItem[] {
  return pages.map((page) => (page.id === id ? { ...page, rotation: normalize_rotation(page.rotation + delta) } : page));
}

export function rotate_all(pages: PageItem[], delta: number): PageItem[] {
  return pages.map((page) => ({ ...page, rotation: normalize_rotation(page.rotation + delta) }));
}

export function remove_page(pages: PageItem[], id: string): PageItem[] {
  return pages.filter((page) => page.id !== id);
}

export function insert_blank(pages: PageItem[], index: number, make_id: () => string = () => crypto.randomUUID()): PageItem[] {
  const next = [...pages];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, { id: make_id(), source: null, rotation: 0 });
  return next;
}

export function is_unchanged(pages: PageItem[], count: number): boolean {
  return pages.length === count && pages.every((page, index) => page.source === index && page.rotation === 0);
}
