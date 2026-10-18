import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { SECTION_IDS } from "./sections";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "settings",
  name: "Settings",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 640 },
      height: { min: 480 },
    },
  },
  associations: [".webos-theme"],
  /**
   * `section` opens on that section, e.g. What's new from the update toast (ADR-026). `path`, a `.webos-theme` file,
   * opens Appearance with its import preview.
   */
  props: z.object({ section: z.enum(SECTION_IDS).optional(), path: z.string().optional() }),
  highlights: () => import("./highlights"),
  component: () => import("./settings.app.svelte"),
});
