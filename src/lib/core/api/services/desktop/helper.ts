import type { DesktopGrid, DesktopItem } from "./type";
import type { Positions } from "./layout";
import type { Position } from "$lib/core/utils/type";
import type { WidgetSize, WidgetSizeLimits } from "../apps/type";
import { clamp_widget_size } from "../apps/widget";

export const DesktopSort = {
  NAME: "name",
  KIND: "kind",
  DATE: "date",
} as const;
export type DesktopSort = (typeof DesktopSort)[keyof typeof DesktopSort];

export interface DesktopMove {
  name: string;
  to: Position;
}

/** Cells an item covers from its top-left cell: widgets span `w × h`, everything else one (ADR-034). */
export function item_span(item: DesktopItem): { w: number; h: number } {
  return item.kind === "widget" ? item.size : { w: 1, h: 1 };
}

/** Every visible item once, with its top-left cell, in reading order. The grid holds a widget in each cell it covers. */
export function grid_items(grid: DesktopGrid): { item: DesktopItem; x: number; y: number }[] {
  const seen = new Set<string>();
  const result: { item: DesktopItem; x: number; y: number }[] = [];
  grid.forEach((row, y) =>
    row?.forEach((item, x) => {
      if (!item || seen.has(item.name)) return;
      seen.add(item.name);
      result.push({ item, x, y });
    })
  );
  return result;
}

function region_free(grid: DesktopGrid, x: number, y: number, item: DesktopItem): boolean {
  const { w, h } = item_span(item);
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) if (grid[y + dy]?.[x + dx] !== undefined) return false;
  return true;
}

function place(grid: DesktopGrid, x: number, y: number, item: DesktopItem): void {
  const { w, h } = item_span(item);
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) (grid[y + dy] ??= [])[x + dx] = item;
}

const fits_in = (dimensions: { columns: number; rows: number }, x: number, y: number, item: DesktopItem) => {
  const { w, h } = item_span(item);
  return x >= 0 && y >= 0 && x + w <= dimensions.columns && y + h <= dimensions.rows;
};

export interface ResizeTarget {
  size: WidgetSize;
  valid: boolean;
}

export function snap_cells(delta_px: number, cell_px: number): number {
  return cell_px > 0 ? Math.round(delta_px / cell_px) : 0;
}

export class DesktopHelper {
  /**
   * The user's arrangement: each entry at its saved cell. Entries without a position, or whose cells are already taken,
   * come back as `unplaced`.
   */
  public static arrange(entries: DesktopItem[], positions: Positions): { layout: DesktopGrid; unplaced: DesktopItem[] } {
    const layout: DesktopGrid = [];
    const unplaced: DesktopItem[] = [];

    for (const entry of entries) {
      const position = positions[entry.name];
      if (position && region_free(layout, position.x, position.y, entry)) {
        place(layout, position.x, position.y, entry);
      } else {
        unplaced.push(entry);
      }
    }

    return { layout, unplaced };
  }

  /**
   * Where a dragged group lands (ADR-011 revision). Each item takes its target cell when its whole span is on the grid
   * and not taken by an item that stays; otherwise the nearest place it fits. Earlier moves claim first. An item with
   * nowhere to go is left out, so it keeps its cell.
   */
  public static resolve_moves(grid: DesktopGrid, dimensions: { columns: number; rows: number }, moves: DesktopMove[]): Map<string, Position> {
    const moving = new Set(moves.map((move) => move.name));
    const items = new Map(grid_items(grid).map(({ item }) => [item.name, item]));
    const taken: DesktopGrid = [];
    for (const { item, x, y } of grid_items(grid)) if (!moving.has(item.name)) place(taken, x, y, item);

    const free = (x: number, y: number, item: DesktopItem) => fits_in(dimensions, x, y, item) && region_free(taken, x, y, item);
    const resolved = new Map<string, Position>();

    for (const { name, to } of moves) {
      // An entry that isn't on the grid yet (just dropped in from Explorer) takes one cell.
      const item = items.get(name) ?? ({ kind: "file", name, type: "" } as DesktopItem);
      let best: Position | null = free(to.x, to.y, item) ? to : null;
      if (!best) {
        let distance = Infinity;
        for (let y = 0; y < dimensions.rows; y++) {
          for (let x = 0; x < dimensions.columns; x++) {
            const d = (x - to.x) ** 2 + (y - to.y) ** 2;
            if (d < distance && free(x, y, item)) {
              distance = d;
              best = { x, y };
            }
          }
        }
      }
      if (!best) continue;
      place(taken, best.x, best.y, item);
      resolved.set(name, best);
    }

    return resolved;
  }

  /** Cut at the grid edge before clamping to `limits`, so dragging past the edge stops there instead of failing. */
  public static resize_target(
    grid: DesktopGrid,
    dimensions: { columns: number; rows: number },
    name: string,
    size: WidgetSize,
    limits: WidgetSizeLimits
  ): ResizeTarget | null {
    const placed = grid_items(grid).find(({ item }) => item.name === name);
    if (!placed || placed.item.kind !== "widget") return null;
    const { item, x, y } = placed;

    const edged = { w: Math.min(size.w, dimensions.columns - x), h: Math.min(size.h, dimensions.rows - y) };
    const target = clamp_widget_size(edged, limits);
    const resized: DesktopItem = { ...item, size: target };

    const taken: DesktopGrid = [];
    for (const other of grid_items(grid)) if (other.item.name !== name) place(taken, other.x, other.y, other.item);

    return { size: target, valid: fits_in(dimensions, x, y, resized) && region_free(taken, x, y, resized) };
  }

  /**
   * The visible grid for the current size. Items whose span fits keep their cell. Items outside it, then unplaced
   * items, take the first free cells they fit in. Whatever still doesn't fit is left out of the view, never out of
   * the layout.
   */
  public static fit(
    dimensions: { columns: number; rows: number },
    layout: DesktopGrid,
    unplaced: DesktopItem[] = []
  ): DesktopGrid {
    const fitted: DesktopGrid = [];
    const overflow: DesktopItem[] = [];

    for (const { item, x, y } of grid_items(layout)) {
      if (fits_in(dimensions, x, y, item) && region_free(fitted, x, y, item)) place(fitted, x, y, item);
      else overflow.push(item);
    }
    overflow.push(...unplaced);

    for (const item of overflow) {
      search: for (let y = 0; y < dimensions.rows; y++) {
        for (let x = 0; x < dimensions.columns; x++) {
          if (fits_in(dimensions, x, y, item) && region_free(fitted, x, y, item)) {
            place(fitted, x, y, item);
            break search;
          }
        }
      }
    }

    return fitted;
  }

  /**
   * Moves that lay `items` out in sorted order, column by column from the top left (ADR-011 revision). Kind: folders,
   * app shortcuts, then files by extension. Date: newest first; folders have no modified time in OPFS, so they lead.
   */
  public static sort_moves(items: DesktopItem[], by: DesktopSort, rows: number, modified: Map<string, number> = new Map()): DesktopMove[] {
    if (rows <= 0) return [];
    // Widgets keep their place; the icons flow around them when the moves resolve.
    const sorted = items.filter((item) => item.kind !== "widget").sort((a, b) => {
      if (by === DesktopSort.KIND) return kind_rank(a) - kind_rank(b) || extension(a).localeCompare(extension(b)) || compare_names(a, b);
      if (by === DesktopSort.DATE) {
        if (a.kind === "directory" || b.kind === "directory") return kind_rank(a) - kind_rank(b) || compare_names(a, b);
        return (modified.get(b.name) ?? 0) - (modified.get(a.name) ?? 0) || compare_names(a, b);
      }
      return compare_names(a, b);
    });
    return sorted.map((item, i) => ({ name: item.name, to: { x: Math.floor(i / rows), y: i % rows } }));
  }
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export const display_name = (item: DesktopItem) => (item.kind === "shortcut" || item.kind === "widget" ? item.label : item.name);
const compare_names = (a: DesktopItem, b: DesktopItem) => collator.compare(display_name(a), display_name(b));
const kind_rank = (item: DesktopItem) => (item.kind === "directory" ? 0 : item.kind === "shortcut" || item.kind === "widget" ? 1 : 2);

function extension(item: DesktopItem): string {
  if (item.kind !== "file") return "";
  const dot = item.name.lastIndexOf(".");
  return dot > 0 ? item.name.slice(dot + 1).toLowerCase() : "";
}
