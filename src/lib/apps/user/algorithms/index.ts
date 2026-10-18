import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";
import { ALGORITHMS_PROPS } from "./props";

export default define_app({
  id: "algorithms",
  name: "Algorithms",
  icon: AppIcon,
  version: "1.0.0",
  category: AppCategory.DEVELOPER,
  description:
    "Watch classic algorithms work step by step: each step explained in plain words, the pseudocode line lit as it runs, live counters, and inputs you can type, randomise, pick from presets or draw.",
  keywords: [
    "algorithm",
    "algorithms",
    "data structures",
    "computer science",
    "cs",
    "learn",
    "visualize",
    "visualizer",
    "sorting",
    "sort",
    "bubble sort",
    "quick sort",
    "merge sort",
    "heap sort",
    "complexity",
    "big o",
    "pseudocode",
    "step by step",
  ],
  associations: [".algo"],
  props: ALGORITHMS_PROPS,
  defaults: { constraints: { width: { min: 360 }, height: { min: 420 } } },
  shell: () => import("./commands"),
  highlights: () => import("./highlights"),
  component: () => import("./algorithms.app.svelte"),
});
