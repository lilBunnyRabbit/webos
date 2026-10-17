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
  description: "Previews TTF, OTF and WOFF fonts: sample text, sizes, every character and variable axes.",
  keywords: ["font", "typeface", "ttf", "otf", "woff", "woff2", "glyph", "type", "specimen", "variable"],
  associations: [".ttf", ".otf", ".woff", ".woff2", "font/ttf", "font/otf", "font/woff", "font/woff2"],
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
