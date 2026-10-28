import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { SECTION_IDS } from "./ids";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "settings",
  name: "Settings",
  icon: AppIcon,
  category: AppCategory.UTILITIES,
  meta: () => import("./meta"),
  guide: () => import("./guide.md?raw"),
  guide_on_launch: false,
  defaults: {
    constraints: {
      width: { min: 640 },
      height: { min: 480 },
    },
  },
  associations: [".webos-theme"],
  /**
   * `section` opens on that page, e.g. What's new from the update toast (ADR-026); `appearance` still means Theme.
   * `setting` scrolls to that row and rings it (`search.ts` ids). `path`, a `.webos-theme` file, opens Theme with
   * its import preview.
   */
  props: z.object({ section: z.enum(SECTION_IDS).optional(), setting: z.string().optional(), path: z.string().optional() }),
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./settings.app.svelte"),
});
