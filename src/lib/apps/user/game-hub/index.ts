import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { HUB_ID, Tab } from "./labels";
import AppIcon from "./icon.svelte";

export default define_app({
  id: HUB_ID,
  name: "Game Hub",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  props: z.object({ tab: z.enum(Tab).optional() }),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 360 },
    },
  },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  widget: () => import("./widget.svelte"),
  widget_size: { min: { w: 3, h: 1 }, max: { w: 6, h: 4 }, default: { w: 4, h: 2 } },
  default_widget: true,
  component: () => import("./game-hub.app.svelte"),
});
