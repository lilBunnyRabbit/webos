import { z } from "zod";
import { Shape } from "./keys";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  shape: z.enum(Shape).catch(Shape.ANSI),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { shape: Shape.ANSI };
}
