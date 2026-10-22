import type { LexicalEditor } from "lexical";
import { cell_at, set_table_widths } from "./lexical-table";
import { TABLE_CLASS } from "./print";
import { move_border } from "./table";

const REACH = 5;

// Mouse and pen only: touch uses the Table group's width presets, so a finger scrolling the page never grabs a border.
// The handle follows the drag as a guide and the widths are written once, when the drag ends.
export function attach_column_resize(paper: HTMLElement, handle: HTMLElement, editors: () => LexicalEditor[]): () => void {
  let border: { editor: LexicalEditor; key: string; widths: number[]; column: number; table: HTMLElement } | null = null;
  let dragging = false;

  const hide = () => {
    if (dragging) return;
    border = null;
    handle.hidden = true;
  };

  const place = (left: number, table: HTMLElement) => {
    const frame = paper.getBoundingClientRect();
    const box = table.getBoundingClientRect();
    handle.style.left = `${left - frame.left}px`;
    handle.style.top = `${box.top - frame.top}px`;
    handle.style.height = `${box.height}px`;
    handle.hidden = false;
  };

  const hover = (event: PointerEvent) => {
    if (dragging || event.pointerType === "touch" || event.target === handle) return;
    const cell = event.target instanceof Element ? event.target.closest("td, th") : null;
    const table = cell?.closest<HTMLElement>(`table.${TABLE_CLASS}`);
    const editor = cell ? editors().find((candidate) => candidate.getRootElement()?.contains(cell)) : undefined;
    if (!cell || !table || !editor?.isEditable()) return hide();
    const right = cell.getBoundingClientRect().right;
    if (Math.abs(event.clientX - right) > REACH) return hide();
    const found = cell_at(editor, cell);
    if (!found || found.column >= found.columns - 1) return hide();
    border = { editor, key: found.key, widths: found.widths, column: found.column, table };
    place(right, table);
  };

  const down = (event: PointerEvent) => {
    if (!border || event.button !== 0) return;
    event.preventDefault();
    const { table, widths, column, editor, key } = border;
    const start = event.clientX;
    const width = table.getBoundingClientRect().width;
    const origin = handle.getBoundingClientRect().left + handle.offsetWidth / 2;
    let next = widths;
    dragging = true;
    handle.classList.add("dragging");
    const move = (moved: PointerEvent) => {
      next = move_border(widths, column, ((moved.clientX - start) / width) * 100);
      place(origin + ((next[column] - widths[column]) / 100) * width, table);
    };
    handle.setPointerCapture(event.pointerId);
    handle.addEventListener("pointermove", move);
    handle.addEventListener(
      "lostpointercapture",
      () => {
        handle.removeEventListener("pointermove", move);
        handle.classList.remove("dragging");
        dragging = false;
        if (next !== widths) set_table_widths(editor, key, next);
        hide();
      },
      { once: true }
    );
  };

  paper.addEventListener("pointermove", hover);
  paper.addEventListener("pointerleave", hide);
  handle.addEventListener("pointerdown", down);
  return () => {
    paper.removeEventListener("pointermove", hover);
    paper.removeEventListener("pointerleave", hide);
    handle.removeEventListener("pointerdown", down);
  };
}
