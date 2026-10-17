import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { z } from "zod";
import { PageSize, Template } from "./props";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
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
} satisfies ShellContribution;
