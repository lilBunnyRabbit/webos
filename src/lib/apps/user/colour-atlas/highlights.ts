import type { AppHighlight } from "$lib/core/api/services/apps/type";
import { Books as BooksIcon, CalendarCheck as CalendarCheckIcon, Sliders as SlidersIcon } from "phosphor-svelte";

export default [
  {
    icon: SlidersIcon,
    title: "Any model, same target",
    text: "Each round hands you one model's sliders, and every track shows the colours it would give, so even XYB is solvable by eye.",
  },
  {
    icon: BooksIcon,
    title: "Collect the atlas",
    text: "Get within ΔE 5 to collect a model. Its page shows the family, the source and the route its colours take to sRGB.",
  },
  {
    icon: CalendarCheckIcon,
    title: "Daily run",
    text: "Two familiar models, two perceptual and one exotic, the same for everyone each day, plus practice by tier or model.",
  },
] satisfies AppHighlight[];
