import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { Kanban as KanbanIcon } from "phosphor-svelte";
import { due_badge } from "./badge.svelte";

const logic = () => import("./shell");
const card_arg = () => arg.kind("card");
const complete_names = (field: string, partial: string) =>
  field === "board" || field === "column" ? logic().then((m) => m.complete_names(field, partial)) : undefined;

export const KANBAN_PROPS = z.object({
  board: z.string().optional(),
  card: z.string().optional(),
});

export default define_app({
  id: "kanban",
  name: "Kanban",
  icon: KanbanIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "A board for life: errands, projects and ideas, from later to done.",
  keywords: ["kanban", "board", "tasks", "todo", "cards", "planner"],
  props: KANBAN_PROPS,
  badge: due_badge,
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 320 },
    },
  },
  shell: {
    completers: {
      card: async (partial) => (await logic()).complete_cards(partial),
    },
    values: {
      card: {
        columns: ["board", "column", "title", "due", "labels"],
        text: (card) =>
          `${card.id}  ${String(card.column).padEnd(8)} ${card.title}${card.due ? `  due ${card.due}` : ""}`,
        open: (card) => void logic().then((m) => m.open_card(String(card.board_id), String(card.id))),
      },
    },
    commands: [
      define_command({
        id: "kanban",
        description: "Open Kanban, or one card",
        args: z.object({ card: card_arg().optional() }),
        positional: ["card"],
        run: async ({ args }) => (await logic()).open_app(args.card),
      }),
      define_command({
        id: "kanban ls",
        description:
          "Cards on every board, or -b <board>; --due: cards with a due date that aren't done, soonest first",
        args: z.object({
          board: z.string().optional().describe("Only this board"),
          due: z.boolean().default(false).describe("Only open cards with a due date"),
        }),
        short: { board: "b" },
        yields: "card",
        complete: complete_names,
        async *run(context) {
          yield* (await logic()).list(context);
        },
      }),
      define_command({
        id: "kanban add",
        description: "Add a card, to the first column that isn't done unless -c names one",
        args: z.object({
          title: z.array(z.string()).default([]).describe("The card's title"),
          column: z.string().optional().describe("Column name"),
          due: z.string().optional().describe("Due day, YYYY-MM-DD"),
          board: z.string().optional().describe("Board name; the first board by default"),
        }),
        positional: ["title"],
        short: { column: "c", due: "d", board: "b" },
        yields: "card",
        complete: complete_names,
        run: async (context) => (await logic()).add(context),
      }),
      define_command({
        id: "kanban mv",
        description: "Move a card to another column of its board",
        args: z.object({ card: card_arg(), column: z.string() }),
        positional: ["card", "column"],
        yields: "card",
        complete: complete_names,
        run: async (context) => (await logic()).mv(context),
      }),
      define_command({
        id: "kanban done",
        description: "Move a card to its board's done column",
        args: z.object({ card: card_arg() }),
        positional: ["card"],
        yields: "card",
        run: async (context) => (await logic()).done(context),
      }),
      define_command({
        id: "kanban archive",
        description: "Archive a card; with none, archive every done column",
        args: z.object({ card: card_arg().optional() }),
        positional: ["card"],
        run: async (context) => (await logic()).archive(context),
      }),
    ],
  },
  highlights: () => import("./highlights"),
  component: () => import("./kanban.app.svelte"),
});
