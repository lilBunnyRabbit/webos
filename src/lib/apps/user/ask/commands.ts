import { z } from "zod";
import kernel, { AI_REQUIREMENTS, AiAvailability, type AiService } from "$lib/core/api";
import { define_command } from "$lib/core/api/services/shell/define";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  commands: [
    define_command({
      id: "ask",
      description: "Ask the on-device AI; it reads the app commands switched on in Ask, or answers from piped text",
      args: z.object({ question: z.array(z.string()).default([]).describe("The question") }),
      positional: ["question"],
      available: () => kernel.service<AiService>("ai").features.prompt !== AiAvailability.NO || AI_REQUIREMENTS,
      run: async (context) => (await logic()).ask(context),
    }),
  ],
} satisfies ShellContribution;
