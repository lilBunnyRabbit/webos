import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellSession } from "$lib/core/api/services/shell/type";
import { format_bytes, format_datetime } from "$lib/core/utils";
import { FilePdf as FilePdfIcon } from "phosphor-svelte";
import { z } from "zod";
import { PageSize } from "./kinds";
import { SECTION_IDS } from "./sections";

const logic = () => import("./shell");

const pdf_fields = new Set(["path", "paths"]);
const complete_pdfs = (field: string, partial: string, context: { session: ShellSession }) =>
  pdf_fields.has(field) ? logic().then((m) => m.complete_files(partial, context, "pdf")) : undefined;

export default define_app({
  id: "pdf-tools",
  name: "PDF Tools",
  icon: FilePdfIcon,
  version: "1.0.0",
  description: "Merge, organize, split and sign PDFs, turn images into a PDF and pages into images, and generate test PDFs.",
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
  shell: {
    values: {
      "pdf-page": {
        columns: ["page", "size", "rotation"],
        cell: (value, column) => (column === "rotation" ? `${value.rotation}°` : String(value[column] ?? "")),
        text: (value) => `${String(value.page).padStart(3)}  ${value.size}${value.rotation ? `  ${value.rotation}°` : ""}`,
        open: (value) => void logic().then((m) => m.open_page(String(value.path))),
      },
      signature: {
        columns: ["name", "size", "date"],
        cell(value, column) {
          if (column === "size") return value.size === null ? "" : format_bytes(Number(value.size));
          if (column === "date") return value.date === null ? "" : format_datetime(Number(value.date));
          return String(value[column] ?? "");
        },
        text: (value) => String(value.name),
        open: (value) => void logic().then((m) => m.open_signature(String(value.name))),
      },
    },
    commands: [
      define_command({
        id: "pdf tools",
        description: "Open PDF Tools on a section, with a file",
        args: z.object({ section: z.enum(SECTION_IDS).optional(), path: arg.path().optional() }),
        positional: ["section", "path"],
        complete: complete_pdfs,
        run: async (context) => (await logic()).tools(context),
      }),
      define_command({
        id: "pdf merge",
        description: "Merge PDFs, in order, into one",
        args: z.object({
          paths: z.array(arg.path()).default([]).describe("PDFs, or the files piped in"),
          out: arg.path().optional().describe("Output file or folder, next to the first PDF by default"),
        }),
        positional: ["paths"],
        short: { out: "o" },
        yields: "file",
        complete: complete_pdfs,
        run: async (context) => (await logic()).merge(context),
      }),
      define_command({
        id: "pdf split",
        description: "Split a PDF: every page, --ranges \"1-3,5\" or --every N",
        args: z.object({
          path: arg.path(),
          ranges: z.string().optional().describe("One file per range"),
          every: z.number().int().min(1).optional().describe("A file every N pages"),
          dir: arg.path().optional().describe("Output folder, next to the PDF by default"),
        }),
        positional: ["path"],
        short: { dir: "d" },
        yields: "file",
        complete: complete_pdfs,
        async *run(context) {
          yield* await (await logic()).split(context);
        },
      }),
      define_command({
        id: "pdf rotate",
        description: "Save a copy with pages turned clockwise",
        args: z.object({
          path: arg.path(),
          degrees: z.number().int(),
          pages: z.string().optional().describe("Only these pages, like 1-3,5"),
          out: arg.path().optional().describe("Output file or folder, a numbered copy by default"),
        }),
        positional: ["path", "degrees"],
        short: { out: "o" },
        yields: "file",
        complete: complete_pdfs,
        run: async (context) => (await logic()).rotate(context),
      }),
      define_command({
        id: "pdf pages",
        description: "A PDF's pages: size and rotation",
        args: z.object({ path: arg.path() }),
        positional: ["path"],
        yields: "pdf-page",
        complete: complete_pdfs,
        async *run(context) {
          yield* (await logic()).pages(context);
        },
      }),
      define_command({
        id: "pdf images",
        description: "Make a PDF of images, one per page",
        args: z.object({
          paths: z.array(arg.path()).default([]).describe("Images, or the files piped in"),
          out: arg.path().optional().describe("Output file or folder, next to the first image by default"),
          size: z.enum([PageSize.A4, PageSize.LETTER, PageSize.IMAGE]).default(PageSize.A4).describe("Page size; image fits the page to each image"),
        }),
        positional: ["paths"],
        short: { out: "o" },
        yields: "file",
        complete: (field, partial, context) => (field === "paths" ? logic().then((m) => m.complete_files(partial, context, "image")) : undefined),
        run: async (context) => (await logic()).images(context),
      }),
      define_command({
        id: "pdf export",
        description: "Save every page as an image",
        args: z.object({
          path: arg.path(),
          format: z.enum(["png", "jpg"]).default("png"),
          scale: z.number().min(0.5).max(4).default(2).describe("1 is 72 dpi"),
          dir: arg.path().optional().describe("Output folder, next to the PDF by default"),
        }),
        positional: ["path"],
        short: { format: "f", dir: "d" },
        yields: "file",
        complete: complete_pdfs,
        async *run(context) {
          yield* await (await logic()).export_pages(context);
        },
      }),
      define_command({
        id: "testpdf",
        description: "Generate a test PDF with numbered, ruled pages; --size makes one of an exact file size",
        args: z.object({
          pages: z.number().int().min(1).max(50_000).default(10),
          page: z.string().default("a4").describe("a4, letter, a5, a3, legal, mixed, or WxH in mm"),
          orientation: z.enum(["portrait", "landscape", "mixed"]).default("portrait"),
          size: z.string().optional().describe("Exact file size, like 500MB or 2GB: random data spread over the pages"),
          images: z.number().int().min(0).max(16).default(0).describe("Test images on every page"),
          text: z.number().int().min(0).max(50).default(0).describe("Paragraphs of filler text on every page"),
          grid: z.number().min(0).max(500).default(0).describe("Grid lines every N mm"),
          plain: z.boolean().default(false).describe("Only the page number: no rulers, margins, marks, tint or label"),
          to: arg.path().optional().describe("Output file or folder, /home/Documents by default"),
        }),
        short: { pages: "n", to: "o" },
        yields: "file",
        run: async (context) => (await logic()).testpdf(context),
      }),
      define_command({
        id: "signature ls",
        description: "Saved signatures; open one to sign with it",
        yields: "signature",
        async *run() {
          yield* (await logic()).signatures();
        },
      }),
    ],
  },
  highlights: () => import("./highlights"),
  component: () => import("./pdf-tools.app.svelte"),
});
