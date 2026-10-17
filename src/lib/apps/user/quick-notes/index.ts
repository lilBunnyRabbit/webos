import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { open_todos } from "./badge.svelte";
import AppIcon from "./icon.svelte";

export const QUICK_NOTES_PROPS = z.object({
  note: z.string().optional(),
  tab: z.enum(["inbox", "notes", "todo"]).optional(),
});

export default define_app({
  id: "quick-notes",
  name: "Quick Notes",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  description: "Capture a note or a todo from anywhere, triage it later.",
  keywords: ["notes", "note", "todo", "to-do", "tasks", "inbox", "capture", "sticky", "memo", "quno", "journal"],
  props: QUICK_NOTES_PROPS,
  badge: open_todos,
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 320 },
    },
  },
  shell: () => import("./commands"),
  widget: () => import("./widget.svelte"),
  widget_size: { min: { w: 2, h: 2 }, max: { w: 6, h: 5 }, default: { w: 3, h: 2 } },
  component: () => import("./quick-notes.app.svelte"),
});
