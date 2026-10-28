import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "Run a little shop: type each price on the list, give the right total, and keep your regulars' trust.",
  keywords: ["game", "typing", "numpad", "number", "keypad", "shop", "cashier", "register", "practice"],
  pitch: {
    problem: "You want to get quicker and surer at typing numbers.",
    solution: "Ring up customers at a shop register, day after day, where every right total keeps your regulars coming back.",
  },
  authors: [{ name: "LaxDOTexe", github: "LaxDOTexe" }, OWNER],
} satisfies AppMeta;
