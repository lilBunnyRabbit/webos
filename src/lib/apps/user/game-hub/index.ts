import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { define_command } from "$lib/core/api/services/shell/define";
import { format_time } from "$lib/core/games/time";
import { GameController as GameControllerIcon } from "phosphor-svelte";
import { format_duration, format_last_played, HUB_ID, Tab } from "./hub";

const logic = () => import("./shell");

export default define_app({
  id: HUB_ID,
  name: "Game Hub",
  icon: GameControllerIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Every game in one place, with play time, stats and today's daily puzzles.",
  keywords: ["games", "library", "daily", "puzzle", "streak", "stats"],
  props: z.object({ tab: z.enum(Tab).optional() }),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 360 },
    },
  },
  shell: {
    values: {
      game: {
        columns: ["id", "name", "time", "sessions", "last"],
        text: (game) => `${String(game.name).padEnd(14)} ${format_duration(Number(game.time))}`,
        cell: (game, column) => {
          if (column === "time") return format_duration(Number(game.time));
          if (column === "last") return game.last === null ? "never" : format_last_played(new Date(Number(game.last)).toISOString());
          return String(game[column]);
        },
        open: (game) => void logic().then((m) => m.launch(String(game.id))),
      },
      "game-daily": {
        columns: ["id", "name", "solved", "time"],
        text: (daily) => `${String(daily.name).padEnd(14)} ${daily.solved ? `solved in ${format_time(Number(daily.time))}` : "not solved"}`,
        cell: (daily, column) => {
          if (column === "solved") return daily.solved ? "yes" : "no";
          if (column === "time") return daily.time === null ? "" : format_time(Number(daily.time));
          return String(daily[column]);
        },
        open: (daily) => void logic().then((m) => m.launch(String(daily.id), { daily: String(daily.day) })),
      },
    },
    commands: [
      define_command({
        id: "games",
        description: "Every game with its play time, recent first",
        yields: "game",
        async *run() {
          yield* (await logic()).library();
        },
      }),
      define_command({
        id: "games daily",
        description: "Today's daily puzzles and your streak",
        yields: "game-daily",
        async *run() {
          yield* (await logic()).daily();
        },
      }),
      define_command({
        id: "games stats",
        description: "Total play time, sessions and dailies solved",
        run: async () => (await logic()).stats(),
      }),
    ],
  },
  widget: () => import("./widget.svelte"),
  component: () => import("./game-hub.app.svelte"),
});
