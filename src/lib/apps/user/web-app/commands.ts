import { define_command } from "$lib/core/api/services/shell/define";
import { z } from "zod";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  commands: [
    define_command({
      id: "webapp add",
      description: "Save a website as a web app on the desktop",
      args: z.object({
        url: z.string().describe("The address; https:// is added when missing"),
        name: z.string().optional().describe("Name on the icon and the window, from the address by default"),
      }),
      positional: ["url"],
      short: { name: "n" },
      yields: "file",
      run: async (context) => (await logic()).add(context),
    }),
  ],
} satisfies ShellContribution;
