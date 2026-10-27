import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { ai_icon } from "$kit/components/ai-icon";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "doodlehop",
  name: "Doodlehop",
  icon: ai_icon(AppIcon),
  category: AppCategory.GAMES,
  meta: () => import("./meta"),
  defaults: {
    constraints: {
      width: { min: 320 },
      height: { min: 420 },
    },
  },
  highlights: () => import("./highlights"),
  component: () => import("./doodlehop.app.svelte"),
});
