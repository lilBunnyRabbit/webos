import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "icon-pack",
  name: "Icon Pack",
  icon: AppIcon,
  version: "1.0.0",
  description:
    "Turns an SVG or a large image into favicons, app icons and a social card, previewed where they land, zipped with the manifest and head tags.",
  pitch: {
    problem: "A website needs a dozen icon sizes and the tags to match.",
    solution: "Turn one image into favicons, app icons and a social card, zipped with the head tags.",
  },
  keywords: [
    "favicon",
    "ico",
    "icon",
    "apple touch",
    "pwa",
    "manifest",
    "maskable",
    "og image",
    "social card",
    "web app",
  ],
  category: AppCategory.MEDIA,
  tools: ["image/*", ".svg"],
  props: z.object({ path: z.string().optional() }),
  defaults: { constraints: { width: { min: 340 }, height: { min: 360 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./icon-pack.app.svelte"),
});
