import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "terminal",
  name: "Terminal",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description: "Run commands over files, windows and apps, and pipe their results.",
  pitch: {
    problem: "Clicking through windows is slow when you know exactly what you want.",
    solution: "Type commands over files, windows and apps, and pipe one result into the next.",
  },
  keywords: ["shell", "command", "console", "cli", "prompt", "bash", "command line"],
  props: z.object({
    /** The folder to start in; home by default. */
    cwd: z.string().optional(),
    /** A command line to run once at start, like "Open in Terminal" from the palette. */
    run: z.string().optional(),
  }),
  highlights: () => import("./highlights"),
  component: () => import("./terminal.app.svelte"),
});
