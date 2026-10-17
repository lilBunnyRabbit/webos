import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { PuzzlePiece as PuzzlePieceIcon } from "phosphor-svelte";
import { z } from "zod";

export default define_app({
  id: "jigsaw",
  name: "Jigsaw",
  icon: PuzzlePieceIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Cut any picture into a jigsaw puzzle and put it back together.",
  keywords: ["jigsaw", "puzzle", "pieces", "picture", "photo", "image", "game"],
  tools: ["image/*"],
  props: z.object({ path: z.string().optional() }),
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 380 },
    },
  },
  component: () => import("./jigsaw.app.svelte"),
});
