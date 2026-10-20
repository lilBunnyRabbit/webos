import type { AppMeta } from "$lib/core/api";

export default {
  description:
    "Shopping lists made for the store: swipe items off with a thumb, read a list from a photo, and share lists with another phone by QR code.",
  keywords: [
    "shopping",
    "groceries",
    "list",
    "store",
    "todo",
    "checklist",
    "buy",
    "nakupovanje",
    "seznam",
    "share",
    "ocr",
  ],
  pitch: {
    problem: "A paper list gets lost, and a shared one is never the same on both phones.",
    solution: "Keep lists that suggest what you buy, read a list from a photo, and pass changes to another phone by scanning its codes, checking each one before it lands.",
  },
} satisfies AppMeta;
