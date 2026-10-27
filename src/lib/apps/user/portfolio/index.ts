import { z } from "zod";
import { define_app, WindowFlag } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";
import { SECTION_IDS } from "./ids";

export const PORTFOLIO_PROPS = z.object({ section: z.enum(SECTION_IDS).optional() });

export default define_app({
  id: "portfolio",
  name: "Portfolio",
  icon: AppIcon,
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  highlights: () => import("./highlights"),
  props: PORTFOLIO_PROPS,
  // The terminal rail and three columns need about 1250 px; the default 62% share would open the stacked phone layout.
  defaults: { flags: [WindowFlag.MAXIMIZED], constraints: { width: { min: 340 }, height: { min: 420 } } },
  shell: () => import("./commands"),
  component: () => import("./portfolio.app.svelte"),
});
