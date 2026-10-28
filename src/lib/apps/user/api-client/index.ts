import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { APP_ID, HTTP_FILES } from "./methods";
import AppIcon from "./icon.svelte";

export default define_app({
  id: APP_ID,
  name: "API Client",
  icon: AppIcon,
  category: AppCategory.DEVELOPER,
  meta: () => import("./meta"),
  associations: HTTP_FILES,
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  component: () => import("./api-client.app.svelte"),
});
