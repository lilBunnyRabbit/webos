import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { due_badge } from "./badge.svelte";
import AppIcon from "./icon.svelte";

export const KANBAN_PROPS = z.object({
  board: z.string().optional(),
  card: z.string().optional(),
});

export default define_app({
  id: "kanban",
  name: "Kanban",
  icon: AppIcon,
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  props: KANBAN_PROPS,
  badge: due_badge,
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 320 },
    },
  },
  achievements: [
    { id: "first-done", title: "Done and dusted", text: "Move a card into a done column." },
    { id: "cleared", title: "Clean slate", text: "Finish the last open card on a board of three or more." },
    { id: "done-50", title: "Shipped", text: "Move 50 cards into a done column.", goal: 50 },
  ],
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./kanban.app.svelte"),
});
