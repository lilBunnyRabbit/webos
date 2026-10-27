import { define_app, WindowFlag } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "example",
  name: "Example",
  icon: AppIcon,
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
  meta: () => import("./meta"),
  props: z.object({ count: z.number() }),
  shell: () => import("./commands"),
  component: () => import("./example.app.svelte"),
});
