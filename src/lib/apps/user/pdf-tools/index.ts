import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { SECTION_IDS } from "./sections";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "pdf-tools",
  name: "PDF Tools",
  icon: AppIcon,
  version: "1.0.0",
  description:
    "Merge, organize, split and sign PDFs, turn images into a PDF and pages into images, and generate test PDFs.",
  pitch: {
    problem: "Merging or signing a PDF usually means uploading it to a stranger's server.",
    solution: "Merge, split, organize and sign PDFs on your device, and convert them to and from images.",
  },
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
    "test pdf",
    "sample",
    "large file",
  ],
  category: AppCategory.PRODUCTIVITY,
  tools: [".pdf", "application/pdf"],
  props: z.object({
    section: z.enum(SECTION_IDS).optional(),
    path: z.string().optional(),
    paths: z.array(z.string()).optional(),
    signature: z.string().optional(),
  }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./pdf-tools.app.svelte"),
});
