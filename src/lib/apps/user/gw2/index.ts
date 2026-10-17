import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { SECTION_IDS } from "./sections";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "gw2",
  name: "GW2 Tracker",
  icon: AppIcon,
  version: "1.0.0",
  description: "Guild Wars 2 Wizard's Vault objectives, your wallet and crafting goals, from your API key.",
  keywords: ["guild wars", "gw2", "wizard's vault", "dailies", "wallet", "gold", "crafting", "goals", "mmo"],
  category: AppCategory.UTILITIES,
  props: z.object({ section: z.enum(SECTION_IDS).optional() }),
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./gw2.app.svelte"),
});
