import type { DesktopGrid, DesktopItem } from "./type";
import type { Positions } from "./layout";
import type { Position } from "$lib/core/utils/type";

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

export class DesktopHelper {
  /**
   * The user's arrangement: each entry at its saved cell. Entries without a position, or whose cell is already taken,
   * come back as `unplaced`.
   */
  public static arrange(entries: DesktopItem[], positions: Positions): { layout: DesktopGrid; unplaced: DesktopItem[] } {
    const layout: DesktopGrid = [];
    const unplaced: DesktopItem[] = [];

    for (const entry of entries) {
      const position = positions[entry.name];
      if (position && layout[position.y]?.[position.x] === undefined) {
        (layout[position.y] ??= [])[position.x] = entry;
      } else {
        unplaced.push(entry);
      }
    }

    return { layout, unplaced };
  }

  /**
   * Where a dragged group lands (ADR-011 revision). Each item takes its target cell when it's on the grid and not taken
   * by an item that stays; otherwise the nearest free cell. Earlier moves claim first. An item with nowhere to go is
   * left out, so it keeps its cell.
   */
  public static resolve_moves(grid: DesktopGrid, dimensions: { columns: number; rows: number }, moves: DesktopMove[]): Map<string, Position> {
    const moving = new Set(moves.map((move) => move.name));
    const taken = new Set<string>();
    grid.forEach((row, y) => row?.forEach((item, x) => item && !moving.has(item.name) && taken.add(`${x},${y}`)));

    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < dimensions.columns && y < dimensions.rows && !taken.has(`${x},${y}`);
    const resolved = new Map<string, Position>();

    for (const { name, to } of moves) {
      let best: Position | null = free(to.x, to.y) ? to : null;
      if (!best) {
        let distance = Infinity;
        for (let y = 0; y < dimensions.rows; y++) {
          for (let x = 0; x < dimensions.columns; x++) {
            const d = (x - to.x) ** 2 + (y - to.y) ** 2;
            if (d < distance && free(x, y)) {
              distance = d;
              best = { x, y };
            }
          }
        }
      }
      if (!best) continue;
      taken.add(`${best.x},${best.y}`);
      resolved.set(name, best);
    }

    return resolved;
  }

  /**
   * The visible grid for the current size. Items inside the grid keep their cell. Items outside it, then unplaced
   * items, take the first free cells. Whatever still doesn't fit is left out of the view, never out of the layout.
   */
  public static fit(
    dimensions: { columns: number; rows: number },
    layout: DesktopGrid,
    unplaced: DesktopItem[] = []
  ): DesktopGrid {
    const fitted: DesktopGrid = [];
    const overflow: DesktopItem[] = [];

    layout.forEach((row, y) => {
      row?.forEach((item, x) => {
        if (item === undefined) return;
        if (x < dimensions.columns && y < dimensions.rows) {
          (fitted[y] ??= [])[x] = item;
        } else {
          overflow.push(item);
        }
      });
    });
    overflow.push(...unplaced);

    for (let y = 0; y < dimensions.rows && overflow.length > 0; y++) {
      for (let x = 0; x < dimensions.columns && overflow.length > 0; x++) {
        if (fitted[y]?.[x] === undefined) {
          (fitted[y] ??= [])[x] = overflow.shift();
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
    const sorted = [...items].sort((a, b) => {
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

const display_name = (item: DesktopItem) => (item.kind === "shortcut" ? item.label : item.name);
const compare_names = (a: DesktopItem, b: DesktopItem) => collator.compare(display_name(a), display_name(b));
const kind_rank = (item: DesktopItem) => (item.kind === "directory" ? 0 : item.kind === "shortcut" ? 1 : 2);

function extension(item: DesktopItem): string {
  if (item.kind !== "file") return "";
  const dot = item.name.lastIndexOf(".");
  return dot > 0 ? item.name.slice(dot + 1).toLowerCase() : "";
}
