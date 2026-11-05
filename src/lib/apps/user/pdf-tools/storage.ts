import { z } from "zod";
import { PageSize } from "./kinds";
import { Ink } from "./pdf";
import { DEFAULT_PDF, SizeBy, test_pdf_schema } from "./test-pdf";

const export_schema = z.object({ format: z.enum(["png", "jpg"]), scale: z.enum(["1", "2", "3", "4"]) });
const images_schema = z.object({
  size: z.enum([PageSize.A4, PageSize.LETTER, PageSize.A3, PageSize.IMAGE]),
  margin: z.enum(["0", "18", "36", "72"]),
});
const sign_schema = z.object({ ink: z.enum([Ink.BLACK, Ink.BLUE]), date: z.boolean() });
const test_settings_schema = z.object({ options: test_pdf_schema, by: z.enum([SizeBy.NATURAL, SizeBy.BYTES]), target: z.string() });

export interface StorageFile {
  export: z.infer<typeof export_schema>;
  images: z.infer<typeof images_schema>;
  sign: z.infer<typeof sign_schema>;
  "test-pdf": z.infer<typeof test_settings_schema>;
}

export function empty_storage(): StorageFile {
  return {
    export: { format: "png", scale: "2" },
    images: { size: PageSize.A4, margin: "36" },
    sign: { ink: Ink.BLACK, date: false },
    "test-pdf": { options: DEFAULT_PDF, by: SizeBy.NATURAL, target: "100MB" },
  };
}

// One schema for every section: whichever section opens storage.json first parses it for all of them.
// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  export: export_schema.catch(() => empty_storage().export),
  images: images_schema.catch(() => empty_storage().images),
  sign: sign_schema.catch(() => empty_storage().sign),
  "test-pdf": test_settings_schema.catch(() => empty_storage()["test-pdf"]),
});
