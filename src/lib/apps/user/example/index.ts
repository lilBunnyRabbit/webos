import { defineApp, WindowFlag } from "$lib/core/api";
import { HandIcon } from "@lucide/svelte";

export default defineApp({
  id: "example",
  name: "Example",
  icon: HandIcon,
  version: "1.0.0",
  author: "John Doe",
  categories: ["user"],
  defaults: {
    constraints: {
      width: {
        min: 250,
        max: 500,
      },
    },
    flags: [WindowFlag.DEBUG],
  },
  component: () => import("./example.app.svelte"),
});
