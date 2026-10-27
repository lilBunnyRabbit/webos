import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "shopping-list",
  name: "Shopping List",
  icon: AppIcon,
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  props: z.object({ list: z.string().optional(), photo: z.union([z.boolean(), z.literal("scan")]).optional() }),
  defaults: { constraints: { width: { min: 300 }, height: { min: 400 } } },
  highlights: () => import("./highlights"),
  shell: () => import("./commands"),
  widget: () => import("./widget.svelte"),
  widget_size: { min: { w: 3, h: 1 }, max: { w: 6, h: 2 }, default: { w: 4, h: 1 } },
  achievements: [
    { id: "first-read", title: "Off the page", text: "Add a list read from a photo or a scan." },
    { id: "all-in", title: "Every last one", text: "Tick off everything on a list of five or more." },
    { id: "bought-100", title: "Regular", text: "Clear 100 items from the cart.", goal: 100 },
    { id: "shared", title: "Two phones, one list", text: "Apply changes from another phone." },
  ],
  component: () => import("./shopping-list.app.svelte"),
});
