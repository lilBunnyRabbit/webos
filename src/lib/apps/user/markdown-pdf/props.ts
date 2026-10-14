import { z } from "zod";
// Not via the barrel: manifests load while the barrel is still initializing, so its constants are not yet defined.
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";

export const Template = { CLEAN: "clean", REPORT: "report", NOTES: "notes" } as const;
export type Template = (typeof Template)[keyof typeof Template];

export const PageSize = { A4: "a4", LETTER: "letter" } as const;
export type PageSize = (typeof PageSize)[keyof typeof PageSize];

export const MARKDOWN_PDF_PROPS = FILE_PROPS.extend({
  template: z.enum(Template).optional(),
  size: z.enum(PageSize).optional(),
  landscape: z.boolean().optional(),
  toc: z.boolean().optional(),
  print: z.boolean().optional(),
});
export type MarkdownPdfProps = z.infer<typeof MARKDOWN_PDF_PROPS>;
