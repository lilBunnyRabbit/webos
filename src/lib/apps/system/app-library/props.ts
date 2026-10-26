import { z } from "zod";

export const StorePlace = { DISCOVER: "discover", APPS: "apps", LIBRARY: "library", UPDATES: "updates" } as const;
export type StorePlace = (typeof StorePlace)[keyof typeof StorePlace];

/** `showcase` and `store` are the views before the 2026-10-27 redesign, kept for old links. */
export const LibraryView = { ...StorePlace, SHOWCASE: "showcase", STORE: "store" } as const;
export type LibraryView = (typeof LibraryView)[keyof typeof LibraryView];

export function place_of(view: LibraryView): StorePlace {
  if (view === LibraryView.SHOWCASE) return StorePlace.DISCOVER;
  if (view === LibraryView.STORE) return StorePlace.APPS;
  return view;
}

export const APP_LIBRARY_PROPS = z.object({
  view: z.enum(Object.values(LibraryView)).optional(),
  app: z.string().optional(),
});
