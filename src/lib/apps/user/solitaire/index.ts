import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { define_command } from "$lib/core/api/services/shell/define";
import { format_time } from "$lib/core/games/time";
import { Cards as CardsIcon } from "phosphor-svelte";

const logic = () => import("./shell");

export const SOLITAIRE_PROPS = z.object({
  daily: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Deals a new game in this mode, asking first when one is in progress. */
  draw: z.union([z.literal(1), z.literal(3)]).optional(),
});

export default define_app({
  id: "solitaire",
  name: "Solitaire",
  icon: CardsIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Klondike: build each suit from ace to king, drawing one card or three.",
  keywords: ["klondike", "patience", "cards", "card game", "game", "classic"],
  props: SOLITAIRE_PROPS,
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 420 },
    },
  },
  shell: {
    values: {
      "solitaire-stats": {
        columns: ["mode", "played", "won", "best_time", "best_score"],
        text: (entry) => `${entry.mode}: won ${entry.won} of ${entry.played}`,
        cell: (entry, column) => {
          if (column === "best_time") return entry.best_time === null ? "" : format_time(Number(entry.best_time));
          if (column === "best_score") return entry.best_score === null ? "" : String(entry.best_score);
          return String(entry[column]);
        },
      },
    },
    commands: [
      define_command({
        id: "solitaire",
        description: "Deal a new game, Draw 1 or Draw 3 (your last choice by default)",
        args: z.object({ draw: z.enum(["1", "3"]).optional().describe("Cards drawn from the stock") }),
        run: async (context) => (await logic()).play(context),
      }),
      define_command({
        id: "solitaire daily",
        description: "Play the daily deal: today, or a past day (YYYY-MM-DD, yesterday, -N)",
        args: z.object({ day: z.string().optional() }),
        positional: ["day"],
        run: async (context) => (await logic()).daily(context),
      }),
      define_command({
        id: "solitaire stats",
        description: "Games, wins, best time and best score per draw mode",
        yields: "solitaire-stats",
        async *run() {
          yield* (await logic()).stats();
        },
      }),
    ],
  },
  component: () => import("./solitaire.app.svelte"),
});
