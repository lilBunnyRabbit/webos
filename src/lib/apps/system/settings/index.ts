import { defineApp } from "$lib/core/api";
import { SettingsIcon } from "@lucide/svelte";

export default defineApp({
  id: "settings",
  name: "Settings",
  icon: SettingsIcon,
  version: "1.0.0",
  author: "John Doe",
  categories: ["system"],
  component: () => import("./settings.app.svelte"),
});
