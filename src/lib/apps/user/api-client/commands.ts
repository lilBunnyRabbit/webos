import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { z } from "zod";
import { METHODS } from "./methods";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  commands: [
    define_command({
      id: "wget",
      description: "Download a URL into your files, as a task; only servers that allow other sites (CORS) work",
      args: z.object({
        url: z.string(),
        to: arg.path().optional().describe("Folder to save into, the current one by default"),
        output: z.string().optional().describe("File name; from the server or the URL by default"),
      }),
      positional: ["url"],
      short: { output: "o" },
      yields: "file",
      run: async (context) => (await logic()).wget(context),
    }),
    define_command({
      id: "http",
      description: "Send an HTTP request: the status line and the body, or the body saved with -o",
      args: z.object({
        method: z.string().describe(METHODS.join(", ")),
        url: z.string(),
        header: z.array(z.string()).default([]).describe('"Name: value"; repeat for more'),
        data: z.string().optional().describe("Request body; JSON gets Content-Type: application/json"),
        output: arg.path().optional().describe("Save the body to this file or folder instead"),
      }),
      positional: ["method", "url"],
      short: { header: "H", data: "d", output: "o" },
      complete: (field, partial) =>
        field === "method" ? METHODS.filter((method) => method.startsWith(partial.toUpperCase())).map((value) => ({ value })) : undefined,
      async *run(context) {
        yield* (await logic()).http(context);
      },
    }),
  ],
} satisfies ShellContribution;
