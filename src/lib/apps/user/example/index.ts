import type { AppManifest } from "$lib/core/api";

export default {
  id: "example",
  name: "Example",
  component: () => import("./Example.svelte").then((m) => m.default),
} satisfies AppManifest;