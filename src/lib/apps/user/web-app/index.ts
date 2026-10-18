import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "web-app",
  name: "Web App",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  description: "Keep a website on the desktop and open it in its own window.",
  pitch: {
    problem: "Sites you use every day get lost among browser tabs.",
    solution: "Keep a website on the desktop and open it in its own window.",
  },
  keywords: ["website", "web", "url", "link", "bookmark", "browser", "iframe", "shortcut", "pwa"],
  associations: [".webapp"],
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 320 }, height: { min: 300 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./web-app.app.svelte"),
});
