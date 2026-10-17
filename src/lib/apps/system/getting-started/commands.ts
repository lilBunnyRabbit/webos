import { z } from "zod";
import { define_command } from "$lib/core/api/services/shell/define";
import { TOPIC_IDS } from "./ids";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

export default {
  commands: [
    define_command({
      id: "tour",
      description: "Open Getting started, optionally at a topic",
      args: z.object({ topic: z.enum(TOPIC_IDS).optional() }),
      positional: ["topic"],
      run: async ({ args }) => (await import("./shell")).tour(args.topic),
    }),
  ],
} satisfies ShellContribution;
