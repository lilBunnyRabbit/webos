import { z } from "zod";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  groups: z.record(z.string(), z.boolean()).catch({}),
  smart: z.boolean().catch(true),
  units: z.enum(["mm", "in"]).catch("mm"),
  marks: z.boolean().catch(false),
  spelling: z.boolean().catch(false),
  ignored: z.array(z.string()).catch([]),
  dictionary: z.array(z.string()).catch([]),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { groups: {}, smart: true, units: "mm", marks: false, spelling: false, ignored: [], dictionary: [] };
}
