import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import AppIcon from "./icon.svelte";

export default define_app({
  id: "motion-watch",
  name: "Motion Watch",
  icon: AppIcon,
  category: AppCategory.MEDIA,
  meta: () => import("./meta"),
  highlights: () => import("./highlights"),
  guide: () => import("./guide.md?raw"),
  defaults: { constraints: { width: { min: 320 }, height: { min: 420 } } },
  achievements: [
    { id: "first-clip", title: "Caught on camera", text: "Catch something moving on a clip." },
    { id: "busy-day", title: "Busy day", text: "Catch 10 clips in one day.", goal: 10 },
    { id: "night-watch", title: "Night watch", text: "Catch motion between midnight and five in the morning.", secret: true },
  ],
  background: () => import("./watch.svelte"),
  component: () => import("./motion-watch.app.svelte"),
});
