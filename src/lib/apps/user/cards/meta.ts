import type { AppMeta } from "$lib/core/api";

export default {
  description: "Keep your loyalty cards in one place and show their barcode at the checkout.",
  keywords: ["cards", "loyalty", "wallet", "barcode", "qr", "membership", "store", "rewards", "points", "shopping", "scan"],
  pitch: {
    problem: "A wallet full of loyalty cards, and never the right one at the till.",
    solution: "Scan or type each card once, then show its barcode full screen at the checkout.",
  },
} satisfies AppMeta;
