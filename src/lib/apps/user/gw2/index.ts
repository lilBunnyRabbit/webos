import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { SECTION_IDS } from "./sections";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "gw2",
  name: "GW2 Tracker",
  icon,
  version: "1.1.0",
  meta: () => import("./meta"),
  category: AppCategory.UTILITIES,
  props: z.object({ section: z.enum(SECTION_IDS).optional(), query: z.string().optional() }),
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./gw2.app.svelte"),
});
