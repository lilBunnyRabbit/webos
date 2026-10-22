import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "web-app",
  name: "Web App",
  icon,
  version: "1.0.0",
  category: AppCategory.UTILITIES,
  meta: () => import("./meta"),
  associations: [".webapp"],
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 320 }, height: { min: 300 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./web-app.app.svelte"),
});
