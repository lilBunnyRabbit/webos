// Chrome stops growing an element at about 33.5M px; past this the scrollbar maps onto the rows proportionally.
export const MAX_SCROLL_HEIGHT = 10_000_000;

export interface RowWindow {
  first: number;
  end: number;
  /** Zero or negative: `first` sits above the viewport's top edge by the overscan plus the partly scrolled row. */
  offset: number;
}

export function content_height(total_rows: number, row_height: number): number {
  return total_rows * row_height;
}

export function scroll_height(total_rows: number, row_height: number): number {
  return Math.min(content_height(total_rows, row_height), MAX_SCROLL_HEIGHT);
}

/** Content pixels per scrollbar pixel: 1 until the file outgrows `MAX_SCROLL_HEIGHT`. */
export function scroll_scale(total_rows: number, row_height: number, viewport_height: number): number {
  const max_content = content_height(total_rows, row_height) - viewport_height;
  const max_scroll = scroll_height(total_rows, row_height) - viewport_height;
  return max_scroll > 0 && max_content > max_scroll ? max_content / max_scroll : 1;
}

export function clamp_top(top: number, total_rows: number, row_height: number, viewport_height: number): number {
  return Math.min(Math.max(0, top), Math.max(0, content_height(total_rows, row_height) - viewport_height));
}

export function row_window(top: number, viewport_height: number, total_rows: number, row_height: number, overscan: number): RowWindow {
  const clamped = clamp_top(top, total_rows, row_height, viewport_height);
  const first_visible = Math.floor(clamped / row_height);
  const first = Math.max(0, first_visible - overscan);
  const end = Math.min(total_rows, Math.ceil((clamped + viewport_height) / row_height) + overscan);
  return { first, end, offset: first * row_height - clamped };
}

export function reveal_row(top: number, row: number, row_height: number, viewport_height: number): number {
  const row_top = row * row_height;
  if (row_top < top) return row_top;
  if (row_top + row_height > top + viewport_height) return row_top + row_height - viewport_height;
  return top;
}

export function rows_per_page(viewport_height: number, row_height: number): number {
  return Math.max(1, Math.floor(viewport_height / row_height));
}
