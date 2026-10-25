import { z } from "zod";
import { LAYOUT_DIRECTORY } from "./layout";
import type { DesktopItem } from "./type";

/** The mobile home's arrangement of `/home/Desktop` (ADR-016). Separate from the desktop's cells: neither maps onto the other. */
export const HOME_LAYOUT_FILE = "home-layout.json";
export const HOME_LAYOUT_PATH = `${LAYOUT_DIRECTORY}/${HOME_LAYOUT_FILE}`;
const HOME_LAYOUT_VERSION = 1;

const home_layout_schema = z.object({
  version: z.literal(HOME_LAYOUT_VERSION),
  order: z.array(z.string()),
  /** The dock of the grid home, gone since the list home (2026-10-25). Read once to migrate, never written. */
  dock: z.array(z.string()).optional(),
});

export interface HomeLayout {
  /** Entry names in home order. Names missing from it follow in folder order. */
  order: string[];
}

export interface ParsedHomeLayout {
  layout: HomeLayout;
  /** The file still had a dock: its entries were appended to the order, and the file needs writing back without it. */
  migrated: boolean;
}

export const EMPTY_HOME_LAYOUT: HomeLayout = { order: [] };

/** Unknown version or a corrupt file means no saved order: every entry shows in folder order. */
export function parse_home_layout(text: string): ParsedHomeLayout {
  try {
    const result = home_layout_schema.safeParse(JSON.parse(text));
    if (!result.success) return { layout: EMPTY_HOME_LAYOUT, migrated: false };
    const { order, dock } = result.data;
    if (dock === undefined) return { layout: { order }, migrated: false };
    return { layout: { order: [...new Set([...order, ...dock])] }, migrated: true };
  } catch {
    return { layout: EMPTY_HOME_LAYOUT, migrated: false };
  }
}

export function serialize_home_layout(layout: HomeLayout): string {
  return JSON.stringify({ version: HOME_LAYOUT_VERSION, order: layout.order }, null, 2);
}

/** Entries in the saved order, then entries the order doesn't know in folder order. */
export function arrange_home(entries: DesktopItem[], layout: HomeLayout): DesktopItem[] {
  const by_name = new Map(entries.map((entry) => [entry.name, entry]));
  const placed = new Set<string>();
  const home: DesktopItem[] = [];
  for (const name of layout.order) {
    const entry = by_name.get(name);
    if (!entry || placed.has(name)) continue;
    placed.add(name);
    home.push(entry);
  }
  for (const entry of entries) {
    if (!placed.has(entry.name)) home.push(entry);
  }
  return home;
}
