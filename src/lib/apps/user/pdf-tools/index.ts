import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import { SECTION_IDS } from "./sections";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "pdf-tools",
  name: "PDF Tools",
  icon: AppIcon,
  meta: () => import("./meta"),
  category: AppCategory.PRODUCTIVITY,
  tools: [".pdf", "application/pdf"],
  props: z.object({
    section: z.enum(SECTION_IDS).optional(),
    path: z.string().optional(),
    paths: z.array(z.string()).optional(),
    signature: z.string().optional(),
  }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  component: () => import("./pdf-tools.app.svelte"),
});
