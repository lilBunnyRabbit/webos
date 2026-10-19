import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "shopping-list",
  name: "Shopping List",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  props: z.object({ list: z.string().optional(), photo: z.boolean().optional() }),
  defaults: { constraints: { width: { min: 300 }, height: { min: 400 } } },
  highlights: () => import("./highlights"),
  widget: () => import("./widget.svelte"),
  widget_size: { min: { w: 3, h: 1 }, max: { w: 6, h: 2 }, default: { w: 4, h: 1 } },
  component: () => import("./shopping-list.app.svelte"),
});
