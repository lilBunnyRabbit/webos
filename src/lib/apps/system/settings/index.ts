import type { AppManifest } from "$lib/core/api";
import { WindowFlag } from "$lib/core/api";
import { SettingsIcon } from "@lucide/svelte";

export default {
  id: "settings",
  name: "Settings",
  icon: SettingsIcon,
  version: "1.0.0",
  author: "John Doe",
  categories: ["system"],
  component: () => import("./settings.app.svelte").then((m) => m.default),
} satisfies AppManifest;
