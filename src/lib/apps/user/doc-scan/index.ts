import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { APP_ID } from "./ids";
import AppIcon from "./icon.svelte";

export default define_app({
  id: APP_ID,
  name: "Doc Scan",
  icon: AppIcon,
  meta: () => import("./meta"),
  category: AppCategory.PRODUCTIVITY,
  tools: ["image/*"],
  props: z.object({
    photo: z.boolean().optional(),
    path: z.string().optional(),
    paths: z.array(z.string()).optional(),
  }),
  defaults: { constraints: { width: { min: 320 }, height: { min: 420 } } },
  provides: { scan: () => import("./scan-sheet.svelte") },
  highlights: () => import("./highlights"),
  component: () => import("./doc-scan.app.svelte"),
});
