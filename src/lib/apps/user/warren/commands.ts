import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution, ShellSession } from "$lib/core/api/services/shell/type";
import { z } from "zod";

const logic = () => import("./shell");

const complete_documents = (field: string, partial: string, context: { session: ShellSession }) =>
  field === "path" ? logic().then((m) => m.complete_documents(partial, context)) : undefined;

export default {
  values: {
    "doc-count": {
      columns: ["name", "words", "characters"],
      text: (value) => `${value.words} words, ${value.characters} characters`,
      open: (value) => void logic().then((m) => m.open(String(value.path))),
    },
  },
  commands: [
    define_command({
      id: "doc count",
      description: "Words and characters in a Warren document",
      args: z.object({ path: arg.path() }),
      positional: ["path"],
      yields: "doc-count",
      complete: complete_documents,
      run: async (context) => (await logic()).count_document(context),
    }),
    define_command({
      id: "doc export",
      description: "Write a Warren document as a Word .docx or Markdown .md next to it",
      args: z.object({
        path: arg.path(),
        docx: z.boolean().default(false).describe("Export as Word .docx"),
        md: z.boolean().default(false).describe("Export as Markdown .md"),
      }),
      positional: ["path"],
      yields: "file",
      complete: complete_documents,
      run: async (context) => (await logic()).export_document(context),
    }),
  ],
} satisfies ShellContribution;
