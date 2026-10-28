import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "terminal",
  name: "Terminal",
  icon: AppIcon,
  category: AppCategory.DEVELOPER,
  meta: () => import("./meta"),
  props: z.object({
    /** The folder to start in; home by default. */
    cwd: z.string().optional(),
    /** A command line to run once at start, like "Open in Terminal" from the palette. */
    run: z.string().optional(),
  }),
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  component: () => import("./terminal.app.svelte"),
});
