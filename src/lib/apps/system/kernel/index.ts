import { defineApp } from "$lib/core/api";
import { BrainIcon } from "@lucide/svelte";

export default defineApp({
  id: "kernel",
  name: "Kernel",
  icon: BrainIcon,
  version: "1.0.0",
  author: "John Doe",
  categories: ["system"],
  component: () => import("./kernel.app.svelte"),
});
