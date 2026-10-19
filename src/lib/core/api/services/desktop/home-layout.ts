import { z } from "zod";
import { LAYOUT_DIRECTORY } from "./layout";
import type { DesktopItem } from "./type";
import type { WidgetSize } from "../apps/type";

/** The mobile home's arrangement of `/home/Desktop` (ADR-016). Separate from the desktop's cells: neither maps onto the other. */
export const HOME_LAYOUT_FILE = "home-layout.json";
export const HOME_LAYOUT_PATH = `${LAYOUT_DIRECTORY}/${HOME_LAYOUT_FILE}`;
const HOME_LAYOUT_VERSION = 1;

/** Fits a phone's dock row; tablets keep the same count so the dock means the same thing on both. */
export const DOCK_SIZE = 4;

const home_layout_schema = z.object({
  version: z.literal(HOME_LAYOUT_VERSION),
  order: z.array(z.string()),
  dock: z.array(z.string()).max(DOCK_SIZE),
});

export interface HomeLayout {
  /** Entry names in home order. Names missing from it follow in folder order. */
  order: string[];
  dock: string[];
}

export const EMPTY_HOME_LAYOUT: HomeLayout = { order: [], dock: [] };

/** Unknown version or a corrupt file means no saved order: every entry shows in folder order, the dock is empty. */
export function parse_home_layout(text: string): HomeLayout {
  try {
    const result = home_layout_schema.safeParse(JSON.parse(text));
    return result.success ? { order: result.data.order, dock: result.data.dock } : EMPTY_HOME_LAYOUT;
  } catch {
    return EMPTY_HOME_LAYOUT;
  }
}

export function serialize_home_layout(layout: HomeLayout): string {
  return JSON.stringify({ version: HOME_LAYOUT_VERSION, ...layout }, null, 2);
}

/** Splits entries into the dock (dock order) and home (saved order, then unknown entries in folder order). */
export function arrange_home(entries: DesktopItem[], layout: HomeLayout): { home: DesktopItem[]; dock: DesktopItem[] } {
  const by_name = new Map(entries.map((entry) => [entry.name, entry]));
  const dock = layout.dock.flatMap((name) => by_name.get(name) ?? []).slice(0, DOCK_SIZE);
  const docked = new Set(dock.map((entry) => entry.name));

  const placed = new Set<string>();
  const home: DesktopItem[] = [];
  for (const name of layout.order) {
    const entry = by_name.get(name);
    if (!entry || docked.has(name) || placed.has(name)) continue;
    placed.add(name);
    home.push(entry);
  }
  for (const entry of entries) {
    if (!docked.has(entry.name) && !placed.has(entry.name)) home.push(entry);
  }

  return { home, dock };
}

export interface HomeSlot {
  item: DesktopItem;
  /** Top-left cell on its page, 0-based. */
  x: number;
  y: number;
  size: WidgetSize;
}

/** A widget's cells on a home of `columns × rows`, cut to fit; everything else is one cell. */
export function home_span(item: DesktopItem, columns: number, rows: number): WidgetSize {
  if (item.kind !== "widget") return { w: 1, h: 1 };
  return { w: Math.max(1, Math.min(item.size.w, columns)), h: Math.max(1, Math.min(item.size.h, rows)) };
}

/**
 * Places items in order on pages of `columns × rows` cells, the way CSS grid's sparse auto-placement would: the cursor
 * only moves forward, so icons after a widget fill the cells beside it but never a gap before it, and the order the user
 * set is the order on screen. An item that fits nowhere after the cursor starts the next page. Always at least one page.
 */
export function paginate_spans(items: DesktopItem[], columns: number, rows: number): HomeSlot[][] {
  if (columns <= 0 || rows <= 0) return [[]];

  const pages: HomeSlot[][] = [[]];
  let taken = new Set<string>();
  let cursor = { x: 0, y: 0 };

  const fits = (x: number, y: number, size: WidgetSize) => {
    if (x + size.w > columns || y + size.h > rows) return false;
    for (let dy = 0; dy < size.h; dy++) for (let dx = 0; dx < size.w; dx++) if (taken.has(`${x + dx},${y + dy}`)) return false;
    return true;
  };

  const find = (size: WidgetSize) => {
    for (let y = cursor.y; y < rows; y++) for (let x = y === cursor.y ? cursor.x : 0; x < columns; x++) if (fits(x, y, size)) return { x, y };
    return null;
  };

  for (const item of items) {
    const size = home_span(item, columns, rows);
    let spot = find(size);
    if (!spot) {
      pages.push([]);
      taken = new Set();
      cursor = { x: 0, y: 0 };
      spot = { x: 0, y: 0 };
    }
    for (let dy = 0; dy < size.h; dy++) for (let dx = 0; dx < size.w; dx++) taken.add(`${spot.x + dx},${spot.y + dy}`);
    pages[pages.length - 1].push({ item, ...spot, size });
    cursor = { x: spot.x + size.w, y: spot.y };
  }

  return pages;
}
