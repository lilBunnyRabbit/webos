import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { z } from "zod";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  commands: [
    define_command({
      id: "qr",
      description: "Make a QR code image of text, or of what's piped in",
      args: z.object({
        text: z.array(z.string()).default([]).describe("The text; quote it or give it as words"),
        ecc: z.enum(["L", "M", "Q", "H"]).default("M").describe("Error correction: L 7%, M 15%, Q 25%, H 30%"),
        out: arg.path().optional().describe("A .png or .svg file, or a folder; qr.png in the current folder by default"),
      }),
      positional: ["text"],
      short: { out: "o", ecc: "e" },
      yields: "file",
      run: async (context) => (await logic()).qr(context),
    }),
  ],
} satisfies ShellContribution;
