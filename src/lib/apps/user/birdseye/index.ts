import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "birdseye",
  name: "Birdseye",
  icon,
  version: "1.0.0",
  meta: () => import("./meta"),
  category: AppCategory.MEDIA,
  tools: ["video/*"],
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 420 } } },
  highlights: () => import("./highlights"),
  component: () => import("./birdseye.app.svelte"),
});
