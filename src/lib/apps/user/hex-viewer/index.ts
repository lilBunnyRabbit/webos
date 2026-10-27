import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export const offset = z.number().int().min(0);

export default define_app({
  id: "hex-viewer",
  name: "Hex Viewer",
  icon: AppIcon,
  category: AppCategory.DEVELOPER,
  meta: () => import("./meta"),
  props: z.object({ path: z.string().optional(), offset: offset.optional() }),
  tools: ["*"],
  defaults: {
    constraints: {
      width: { min: 360 },
      height: { min: 280 },
    },
  },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./hex-viewer.app.svelte"),
});
