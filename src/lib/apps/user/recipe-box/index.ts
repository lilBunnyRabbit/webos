import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { APP_ID, COOK_FILES } from "./constants";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: APP_ID,
  name: "Recipe Box",
  icon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  associations: COOK_FILES,
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./recipe-box.app.svelte"),
});
