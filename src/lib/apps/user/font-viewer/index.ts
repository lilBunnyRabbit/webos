import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "font-viewer",
  name: "Font Viewer",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.MEDIA,
  meta: () => import("./meta"),
  associations: [".ttf", ".otf", ".woff", ".woff2", ".ttc", "font/ttf", "font/otf", "font/woff", "font/woff2", "font/collection"],
  props: z.object({ path: z.string().optional() }),
  defaults: {
    constraints: {
      width: { min: 360 },
      height: { min: 320 },
    },
  },
  highlights: () => import("./highlights"),
  component: () => import("./font-viewer.app.svelte"),
});
