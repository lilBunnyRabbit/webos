import type { AppMeta } from "$lib/core/api";

export default {
  description: "Reads PDF documents with the browser's built-in viewer.",
  keywords: ["pdf", "document", "reader", "viewer"],
  pitch: {
    problem: "A PDF in your files should open without downloading anything.",
    solution: "Read it in the browser's own PDF viewer, right in a window.",
  },
} satisfies AppMeta;
