import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import icon from "./icon.svg?no-inline";

export default define_app({
  id: "link-preview",
  name: "Link Preview",
  icon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  meta: () => import("./meta"),
  tools: ["text/html", ".html", ".htm"],
  props: z.object({ path: z.string().optional(), url: z.string().optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  highlights: () => import("./highlights"),
  component: () => import("./link-preview.app.svelte"),
});
