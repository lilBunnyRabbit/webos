import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { FilePdf as FilePdfIcon } from "phosphor-svelte";
import { z } from "zod";
import { MARKDOWN_PDF_PROPS, PageSize, Template } from "./props";

const logic = () => import("./shell");

export default define_app({
  id: "markdown-pdf",
  name: "Markdown to PDF",
  icon: FilePdfIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Lay out a Markdown file as pages and save it as a PDF.",
  keywords: ["markdown", "pdf", "print", "export", "document", "md"],
  tools: [".md", ".markdown", "text/markdown"],
  props: MARKDOWN_PDF_PROPS,
  defaults: { constraints: { width: { min: 340 }, height: { min: 320 } } },
  shell: {
    commands: [
      define_command({
        id: "md2pdf",
        description: "Lay out a Markdown file and open the print dialog to save it as a PDF",
        args: z.object({
          path: arg.path(),
          template: z.enum(Template).optional().describe("clean, report or notes"),
          size: z.enum(PageSize).optional().describe("a4 or letter"),
          landscape: z.boolean().default(false),
          toc: z.boolean().default(false).describe("Add a table of contents"),
        }),
        positional: ["path"],
        run: async (context) => (await logic()).md2pdf(context),
      }),
    ],
  },
  component: () => import("./markdown-pdf.app.svelte"),
});
