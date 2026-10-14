import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { Cards as CardsIcon } from "phosphor-svelte";

export const SOLITAIRE_PROPS = z.object({
  daily: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export default define_app({
  id: "solitaire",
  name: "Solitaire",
  icon: CardsIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Klondike: build each suit from ace to king, drawing one card or three.",
  keywords: ["klondike", "patience", "cards", "card game"],
  props: SOLITAIRE_PROPS,
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 420 },
    },
  },
  component: () => import("./solitaire.app.svelte"),
});
