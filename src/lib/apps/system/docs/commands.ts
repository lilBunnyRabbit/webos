import { z } from "zod";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  commands: [
    define_command({
      id: "docs",
      description: "Open Docs, optionally at a page: docs windows, docs adr 47, docs map",
      args: z.object({ topic: z.array(z.string()).default([]).describe("A page id or short name") }),
      positional: ["topic"],
      complete: (field, partial) => (field === "topic" ? logic().then((module) => module.complete_page(partial)) : undefined),
      run: async ({ args }) => (await logic()).open_docs(args.topic.join(" ")),
    }),
  ],
} satisfies ShellContribution;
