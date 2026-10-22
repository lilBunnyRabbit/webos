import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "terminal",
  name: "Terminal",
  icon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  meta: () => import("./meta"),
  props: z.object({
    /** The folder to start in; home by default. */
    cwd: z.string().optional(),
    /** A command line to run once at start, like "Open in Terminal" from the palette. */
    run: z.string().optional(),
  }),
  highlights: () => import("./highlights"),
  component: () => import("./terminal.app.svelte"),
});
