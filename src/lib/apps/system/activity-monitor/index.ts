import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { SECTION_IDS } from "./sections";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "activity-monitor",
  name: "Activity Monitor",
  icon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 480 },
      height: { min: 360 },
    },
  },
  /** `section` opens on that section, e.g. Tasks from the taskbar. */
  props: z.object({ section: z.enum(SECTION_IDS).optional() }),
  component: () => import("./activity-monitor.app.svelte"),
});
