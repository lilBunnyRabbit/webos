import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export const SOLITAIRE_PROPS = z.object({
  daily: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Deals a new game in this mode, asking first when one is in progress. */
  draw: z.union([z.literal(1), z.literal(3)]).optional(),
});

export default define_app({
  id: "solitaire",
  name: "Solitaire",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  props: SOLITAIRE_PROPS,
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 420 },
    },
  },
  shell: () => import("./commands"),
  component: () => import("./solitaire.app.svelte"),
});
