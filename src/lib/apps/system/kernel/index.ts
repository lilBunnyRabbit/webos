import type { AppManifest } from "$lib/core/api";
import { WindowFlag } from "$lib/core/api";
import { BrainIcon } from "@lucide/svelte";

export default {
  id: "kernel",
  name: "Kernel",
  icon: BrainIcon,
  version: "1.0.0",
  author: "John Doe",
  categories: ["system"],
  component: () => import("./kernel.app.svelte").then((m) => m.default),
} satisfies AppManifest;
