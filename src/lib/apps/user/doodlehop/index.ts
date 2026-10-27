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
  achievements: [
    { id: "first-round", title: "First doodle", text: "Finish a round." },
    { id: "half", title: "Getting the picture", text: "Get 3 drawings recognised in one round." },
    { id: "perfect", title: "Gallery", text: "Get all 6 drawings recognised in one round." },
    { id: "recognised-50", title: "Prolific", text: "Get 50 drawings recognised in all.", goal: 50 },
    { id: "lightning", title: "Lightning sketch", text: "Get a drawing recognised in under 3 seconds.", secret: true },
  ],
  component: () => import("./doodlehop.app.svelte"),
});
