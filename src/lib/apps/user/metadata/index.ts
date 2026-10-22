import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "metadata",
  name: "Metadata",
  icon,
  version: "1.0.0",
  category: AppCategory.MEDIA,
  meta: () => import("./meta"),
  tools: ["image/jpeg", "image/png", "image/webp", ".jpg", ".jpeg", ".png", ".webp", "application/pdf", ".pdf"],
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 320 }, height: { min: 320 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./metadata.app.svelte"),
});
