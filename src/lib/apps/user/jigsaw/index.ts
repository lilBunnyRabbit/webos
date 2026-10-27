import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "jigsaw",
  name: "Jigsaw",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  tools: ["image/*"],
  props: z.object({ path: z.string().optional() }),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 380 },
    },
  },
  component: () => import("./jigsaw.app.svelte"),
});
