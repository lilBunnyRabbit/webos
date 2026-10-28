import type { AppMeta } from "$lib/core/api";
import { OWNER } from "$lib/core/api/services/apps/authors";

export default {
  description: "Falling blocks with four floors: every wall of the square is one, and each piece heads for the wall the game picks.",
  keywords: ["game", "arcade", "falling", "blocks", "puzzle", "lines", "walls", "square", "daily"],
  pitch: {
    problem: "Falling blocks always fall the same way, so the old moves stop being a puzzle.",
    solution: "A square where every wall is a floor: pieces start in the middle and head for the wall the game picks.",
  },
  authors: [{ name: "LaxDOTexe", github: "LaxDOTexe" }, OWNER],
} satisfies AppMeta;
