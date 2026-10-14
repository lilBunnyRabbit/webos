import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Kanban as KanbanIcon } from "phosphor-svelte";
import { due_badge } from "./badge.svelte";

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
  component: () => import("./kanban.app.svelte"),
});
