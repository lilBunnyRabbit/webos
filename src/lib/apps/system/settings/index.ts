import { define_app } from "$lib/core/api";
import { Gear as GearIcon } from "phosphor-svelte";
import { z } from "zod";
import { SECTION_IDS } from "./sections";

export default define_app({
  id: "settings",
  name: "Settings",
  icon: GearIcon,
  version: "1.0.0",
  categories: ["system"],
  defaults: {
    constraints: {
      width: { min: 640 },
      height: { min: 480 },
    },
  },
  /** `section` opens on that section, e.g. What's new from the update toast (ADR-026). */
  props: z.object({ section: z.enum(SECTION_IDS) }),
  component: () => import("./settings.app.svelte"),
});
