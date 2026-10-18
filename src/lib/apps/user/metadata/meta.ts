import type { AppMeta } from "$lib/core/api";

export default {
  description:
    "Shows what a photo or PDF says about itself: camera, date, location, software. Strips it from images without re-encoding.",
  keywords: [
    "metadata",
    "exif",
    "xmp",
    "gps",
    "location",
    "camera",
    "privacy",
    "strip",
    "remove",
    "clean",
    "photo",
    "pdf",
    "properties",
    "info",
  ],
  pitch: {
    problem: "Photos and PDFs can quietly carry your location and device.",
    solution: "See what a file says about itself, and strip it from images without re-encoding.",
  },
} satisfies AppMeta;
