import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FilePdf as FilePdfIcon } from "phosphor-svelte";
import { z } from "zod";

export default define_app({
  id: "pdf-tools",
  name: "PDF Tools",
  icon: FilePdfIcon,
  version: "1.0.0",
  description: "Merge, organize, split and sign PDFs, turn images into a PDF and pages into images.",
  keywords: [
    "pdf",
    "merge",
    "split",
    "combine",
    "sign",
    "signature",
    "pages",
    "rotate",
    "reorder",
    "extract",
    "images to pdf",
    "convert",
    "document",
    "ilovepdf",
  ],
  category: AppCategory.PRODUCTIVITY,
  tools: [".pdf", "application/pdf"],
  props: z.object({
    section: z.enum(["merge", "organize", "split", "sign", "images", "export", "signatures"]).optional(),
    path: z.string().optional(),
    paths: z.array(z.string()).optional(),
  }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  component: () => import("./pdf-tools.app.svelte"),
});
