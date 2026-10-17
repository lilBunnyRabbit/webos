import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z } from "zod";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "nurikabe",
  name: "Nurikabe",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.GAMES,
  description: "Shade the sea so every number becomes an island of exactly that size.",
  keywords: ["islands", "sea", "wall", "nikoli", "puzzle", "logic", "game", "brain"],
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 420 },
    },
  },
  props: z.object({
    daily: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  }),
  shell: () => import("./commands"),
  component: () => import("./nurikabe.app.svelte"),
});
