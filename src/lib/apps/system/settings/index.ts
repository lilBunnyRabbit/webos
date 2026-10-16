import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Gear as GearIcon } from "phosphor-svelte";
import { z } from "zod";
import { SECTION_IDS } from "./sections";

export default define_app({
  id: "settings",
  name: "Settings",
  icon: GearIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  description: "Theme, wallpaper, taskbar, default apps, backups and what's new.",
  keywords: ["preferences", "options", "theme", "dark mode", "wallpaper", "taskbar", "configuration", "control panel", "backup", "restore", "export"],
  defaults: {
    constraints: {
      width: { min: 640 },
      height: { min: 480 },
    },
  },
  /** `section` opens on that section, e.g. What's new from the update toast (ADR-026). */
  props: z.object({ section: z.enum(SECTION_IDS) }),
  highlights: () => import("./highlights"),
  component: () => import("./settings.app.svelte"),
});
