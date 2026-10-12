import { z } from "zod";
import { LAYOUT_DIRECTORY } from "./layout";
import type { DesktopItem } from "./type";

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

/** Pages of `capacity` items. Always at least one page, so an empty home still has somewhere to be. */
export function paginate<T>(items: T[], capacity: number): T[][] {
  if (capacity <= 0) return [items];
  const pages: T[][] = [];
  for (let start = 0; start < items.length; start += capacity) pages.push(items.slice(start, start + capacity));
  return pages.length > 0 ? pages : [[]];
}
