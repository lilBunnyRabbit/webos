import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { TerminalWindow as TerminalWindowIcon } from "phosphor-svelte";
import { z } from "zod";

export default define_app({
  id: "terminal",
  name: "Terminal",
  icon: TerminalWindowIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description: "Run commands over files, windows and apps, and pipe their results.",
  keywords: ["shell", "command", "console", "cli", "prompt"],
  props: z.object({
    /** The folder to start in; home by default. */
    cwd: z.string().optional(),
    /** A command line to run once at start, like "Open in Terminal" from the palette. */
    run: z.string().optional(),
  }),
  component: () => import("./terminal.app.svelte"),
});
