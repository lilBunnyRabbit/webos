import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "cards",
  name: "Cards",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  meta: () => import("./meta"),
  props: z.object({ card: z.string().optional(), import: z.string().optional() }),
  defaults: { constraints: { width: { min: 320 }, height: { min: 400 } } },
  highlights: () => import("./highlights"),
  component: () => import("./cards.app.svelte"),
});
