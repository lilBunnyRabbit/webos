import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "twenty-forty-eight",
  name: "2048",
  icon: AppIcon,
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 420 },
    },
  },
  achievements: [
    { id: "tile-256", title: "Warming up", text: "Make a 256 tile." },
    { id: "tile-1024", title: "Almost there", text: "Make a 1024 tile." },
    { id: "tile-2048", title: "2048", text: "Make a 2048 tile.", goal: 2048 },
    { id: "score-20000", title: "High scorer", text: "Score 20,000 in one game." },
    { id: "tile-4096", title: "Kept going", text: "Make a 4096 tile.", secret: true },
  ],
  component: () => import("./twenty-forty-eight.app.svelte"),
});
