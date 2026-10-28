import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "docs",
  name: "Docs",
  icon: AppIcon,
  category: AppCategory.DEVELOPER,
  meta: () => import("./meta"),
  guide: () => import("./guide.md?raw"),
  guide_on_launch: false,
  /** `page`: a page id (`system/services/windows`) or a short name (`windows`, `adr 47`, `persistence`). */
  props: z.object({ page: z.string().optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  component: () => import("./docs.app.svelte"),
});
