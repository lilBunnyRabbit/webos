import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "lunar-lander",
  name: "Lunar Lander",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 440 },
      height: { min: 320 },
    },
  },
  achievements: [
    { id: "first-landing", title: "Touchdown", text: "Land on the pad." },
    { id: "earth", title: "Heavy landing", text: "Land in Earth gravity." },
    { id: "crosswind", title: "Crosswind", text: "Land with air and wind on." },
    { id: "every-ship", title: "Fleet pilot", text: "Land each of the three ships.", goal: 3 },
    { id: "landings-25", title: "Frequent flyer", text: "Land 25 times.", goal: 25 },
    { id: "soft-touch", title: "Feather", text: "Touch down soft, level and dead centre.", secret: true },
  ],
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  component: () => import("./lunar-lander.app.svelte"),
});
