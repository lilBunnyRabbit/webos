import { define_app, WindowFlag } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "example",
  name: "Example",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  defaults: {
    constraints: {
      width: {
        min: 250,
        max: 500,
      },
    },
    flags: [WindowFlag.DEBUG],
  },
  description: "A starter app showing the app context, saved state, props and a background task.",
  pitch: {
    problem: "Writing your first app is easier with a working one to copy.",
    solution: "A small starter that shows saved state, props and a background task.",
  },
  props: z.object({ count: z.number() }),
  shell: () => import("./commands"),
  component: () => import("./example.app.svelte"),
});
