import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "jigsaw",
  name: "Jigsaw",
  icon,
  version: "1.0.0",
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
