import { define_app, WindowFlag } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Hand as HandIcon } from "phosphor-svelte";
import { z } from "zod";

export default define_app({
  id: "example",
  name: "Example",
  icon: HandIcon,
  version: "1.0.0",
  author: "John Doe",
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
  description: "A starter app showing the app context, saved state and props.",
  props: z.object({ count: z.number() }),
  component: () => import("./example.app.svelte"),
});
