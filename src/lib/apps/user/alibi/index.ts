import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "alibi",
  name: "Alibi",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 480 },
    },
  },
  props: z.object({ seed: z.number().int().nonnegative().optional() }),
  highlights: () => import("./highlights"),
  component: () => import("./alibi.app.svelte"),
});
