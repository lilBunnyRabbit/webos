import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { define_command } from "$lib/core/api/services/shell/define";
import { TextAa as TextAaIcon } from "phosphor-svelte";
import { z } from "zod";

const logic = () => import("./shell");

export default define_app({
  id: "letterer",
  name: "Letterer",
  icon: TextAaIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Guess the hidden word in six tries, on up to eight boards at once, against a word that dodges you, with equations or in a survival run.",
  keywords: [
    "wordle",
    "word",
    "words",
    "guess",
    "letters",
    "puzzle",
    "daily",
    "dordle",
    "quordle",
    "octordle",
    "absurdle",
    "nerdle",
    "survival",
    "game",
  ],
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 520 },
    },
  },
  props: z.object({
    daily: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  shell: {
    commands: [
      define_command({
        id: "letterer daily",
        description: "Play the daily word: today, or a past day (YYYY-MM-DD, yesterday, -N)",
        args: z.object({ day: z.string().optional() }),
        positional: ["day"],
        run: async (context) => (await logic()).daily(context),
      }),
    ],
  },
  highlights: () => import("./highlights"),
  component: () => import("./letterer.app.svelte"),
});
