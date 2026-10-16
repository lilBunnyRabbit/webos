import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { RocketLaunch as RocketLaunchIcon } from "phosphor-svelte";

export default define_app({
  id: "lunar-lander",
  name: "Lunar Lander",
  icon: RocketLaunchIcon,
  version: "0.1.0",
  category: AppCategory.GAMES,
  description: "Pick a ship and a planet, then set it down on the pad, gently.",
  keywords: ["game", "arcade", "rocket", "space", "physics"],
  defaults: {
    constraints: {
      width: { min: 440 },
      height: { min: 320 },
    },
  },
  highlights: () => import("./highlights"),
  component: () => import("./lunar-lander.app.svelte"),
});
