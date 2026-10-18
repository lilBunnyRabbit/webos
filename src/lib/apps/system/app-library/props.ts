import { z } from "zod";

export const LibraryView = { SHOWCASE: "showcase", STORE: "store" } as const;
export type LibraryView = (typeof LibraryView)[keyof typeof LibraryView];

export const APP_LIBRARY_PROPS = z.object({
  view: z.enum(Object.values(LibraryView)).optional(),
  app: z.string().optional(),
});
