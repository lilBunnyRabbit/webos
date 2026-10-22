import { z } from "zod";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

export default {
  commands: [
    define_command({
      id: "journal lock",
      description: "Lock every open Moonrabbit journal",
      args: z.object({}),
      run: async () => {
        const { lock_all } = await import("./sessions");
        const count = lock_all();
        return count ? `locked ${count} ${count === 1 ? "journal" : "journals"}` : "nothing was unlocked";
      },
    }),
  ],
} satisfies ShellContribution;
