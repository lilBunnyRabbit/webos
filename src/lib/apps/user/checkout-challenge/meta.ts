import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "Run a little shop: scan each customer's items and type the total, fast and exactly.",
  keywords: ["game", "typing", "numpad", "number", "keypad", "shop", "cashier", "register", "practice"],
  pitch: {
    problem: "You want to get quicker and surer at typing numbers.",
    solution: "Ring up customers at a shop register, where every right total keeps the shop open.",
  },
  authors: [{ name: "LaxDOTexe", github: "LaxDOTexe" }, OWNER],
} satisfies AppMeta;
