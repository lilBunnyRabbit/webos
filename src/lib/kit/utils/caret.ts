export interface CaretPoint {
  node: Node;
  offset: number;
}

// Safari before 26.2 has only the older, WebKit-named `caretRangeFromPoint`.
export function caret_at_point(x: number, y: number): CaretPoint | null {
  if (typeof document.caretPositionFromPoint === "function") {
    const position = document.caretPositionFromPoint(x, y);
    return position ? { node: position.offsetNode, offset: position.offset } : null;
  }
  const range = document.caretRangeFromPoint?.(x, y);
  return range ? { node: range.startContainer, offset: range.startOffset } : null;
}

export function caret_range_at_point(x: number, y: number): Range | null {
  const caret = caret_at_point(x, y);
  if (!caret) return null;
  const range = document.createRange();
  range.setStart(caret.node, caret.offset);
  range.collapse(true);
  return range;
}
