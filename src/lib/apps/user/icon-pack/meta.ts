import type { AppMeta } from "$lib/core/api";

export default {
  description:
    "Turns an SVG or a large image into favicons, app icons and a social card, previewed where they land, zipped with the manifest and head tags.",
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
  pitch: {
    problem: "A website needs a dozen icon sizes and the tags to match.",
    solution: "Turn one image into favicons, app icons and a social card, zipped with the head tags.",
  },
} satisfies AppMeta;
