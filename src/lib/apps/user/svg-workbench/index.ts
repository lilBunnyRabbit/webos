import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "svg-workbench",
  name: "SVG Workbench",
  icon: AppIcon,
  version: "1.0.0",
  description:
    "Optimise SVGs with SVGO, compare them before and after, export PNGs and turn them into Svelte components.",
  keywords: [
    "svg",
    "svgo",
    "optimize",
    "optimise",
    "minify",
    "vector",
    "icon",
    "png",
    "export",
    "svelte",
    "component",
    "compress",
  ],
  category: AppCategory.DEVELOPER,
  tools: [".svg", "image/svg+xml"],
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./svg-workbench.app.svelte"),
});
