import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "tea-timer",
  name: "Tea Timer",
  icon: AppIcon,
  category: AppCategory.PRODUCTIVITY,
  meta: () => import("./meta"),
  guide: () => import("./guide.md?raw"),
  guide_on_launch: false,
  defaults: { constraints: { width: { min: 320 }, height: { min: 360 } } },
  achievements: [
    { id: "first-brew", title: "Kettle's on", text: "Brew a cup of tea." },
    { id: "resteep", title: "Same leaves", text: "Steep the same leaves a second time." },
    { id: "own-tea", title: "House blend", text: "Brew a tea you added yourself." },
    { id: "brews-50", title: "Tea drinker", text: "Brew 50 cups.", goal: 50 },
  ],
  highlights: () => import("./highlights"),
  component: () => import("./tea-timer.app.svelte"),
});
