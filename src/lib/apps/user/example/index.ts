import type { AppManifest } from "$lib/core/api";
import { WindowFlag } from "$lib/core/api";
import { HandIcon } from "@lucide/svelte";

export default {
  id: "example",
  name: "Example",
  icon: HandIcon,
  version: "1.0.0",
  author: "John Doe",
  categories: ["user"],
  window_options: {
    constraints: {
      width: {
        min: 250,
        max: 500,
      },
    },
    flags: [WindowFlag.DEBUG],
  },
  component: () => import("./example.app.svelte").then((m) => m.default),
} satisfies AppManifest;
