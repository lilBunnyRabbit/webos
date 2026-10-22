import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "archive",
  name: "Archive",
  icon,
  version: "1.0.0",
  meta: () => import("./meta"),
  category: AppCategory.UTILITIES,
  associations: [".zip", "application/zip", "application/x-zip-compressed"],
  props: z.object({ path: z.string().optional(), paths: z.array(z.string()).optional() }),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 320 },
    },
  },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./archive.app.svelte"),
});
