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
  description: "Theme, wallpaper, taskbar, default apps, backups and what's new.",
  pitch: {
    problem: "Everyone wants their desktop to look and behave a little differently.",
    solution: "Change the theme, wallpaper, taskbar, default apps and backups in one place.",
  },
  keywords: [
    "preferences",
    "options",
    "theme",
    "dark mode",
    "wallpaper",
    "taskbar",
    "configuration",
    "control panel",
    "backup",
    "restore",
    "export",
  ],
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
